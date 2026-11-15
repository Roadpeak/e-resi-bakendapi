import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Invoice, Prisma, ServiceRequest, ServiceRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PricingService } from '../admin/pricing.service.js';
import { InvoicesService } from '../billing/invoices.service.js';
import { DocumentPdfService } from '../billing/document-pdf.service.js';
import { resolveAppUrl } from '../common/app-url.js';
import type { DocumentLine, DocumentParams } from '../mail/templates/document.js';
import type { CreateServiceRequestDto, SendQuoteDto } from './dto/service-requests.dto.js';

/** The promise made on the request page: a quote within this long. */
const QUOTE_SLA_MINUTES = 60;
/** How long an accepted quote's invoice gives the customer to pay. */
const INVOICE_TERMS_DAYS = 7;
const DEFAULT_QUOTE_VALID_DAYS = 14;

const day = (n: number) => n * 24 * 60 * 60 * 1000;
const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });
const money = (n: number, c: string) => `${c} ${n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const REQUESTER_LABEL: Record<string, string> = {
  DEVELOPER: 'Developer', AGENT: 'Agent', INVESTOR: 'Investor', BUYER: 'Buyer', TENANT: 'Tenant', OTHER: 'Other',
};

/** Statuses in which the team can still send (or re-send) a quote. */
const QUOTABLE: ServiceRequestStatus[] = ['SUBMITTED', 'QUOTED', 'CHANGES_REQUESTED'];

/**
 * Custom, quote-priced production work. A signed-in customer describes the
 * job; the team replies with a quote (in-app and by email, PDF attached); the
 * customer accepts it or asks for changes; acceptance raises a SERVICE_REQUEST
 * invoice payable by card or M-Pesa; payment moves the request on.
 */
@Injectable()
export class ServiceRequestsService implements OnModuleInit {
  private readonly logger = new Logger(ServiceRequestsService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly pricing: PricingService,
    private readonly invoices: InvoicesService,
    private readonly pdf: DocumentPdfService,
    config: ConfigService,
  ) {
    this.appUrl = resolveAppUrl(config);
  }

  onModuleInit() {
    this.invoices.onPaid('SERVICE_REQUEST', (inv) => this.onInvoicePaid(inv));
    this.invoices.onPath('SERVICE_REQUEST', async (inv) => {
      const r = await this.prisma.serviceRequest.findUnique({ where: { invoiceId: inv.id }, select: { id: true } });
      return r ? this.path(r.id) : null;
    });
  }

  private path(id: string) { return `/services/requests/${id}`; }

  // ─── Numbering ───────────────────────────────────────────────────────────

  /** "SR-2026-000012": reads the highest issued number so a deletion never reuses one. */
  private async nextNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const last = await this.prisma.serviceRequest.findFirst({
      where: { number: { startsWith: `SR-${year}-` } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const seq = last ? Number.parseInt(last.number.split('-')[2], 10) + 1 : 1;
    return `SR-${year}-${String(seq).padStart(6, '0')}`;
  }

  private event(requestId: string, kind: string, message: string, actor: 'CUSTOMER' | 'TEAM') {
    return this.prisma.serviceRequestEvent.create({ data: { requestId, kind, message, actor } });
  }

  // ─── Notifications (never throw: a failed email must not undo the action) ──

  private async notifyUser(
    userId: string, title: string, body: string, requestId: string, email = true,
  ) {
    try {
      await this.notifications.createNotification(
        userId, 'SERVICE_REQUEST_UPDATED', title, body, requestId, 'ServiceRequest', this.path(requestId),
      );
    } catch (e) { this.logger.error(`In-app notify failed: ${(e as Error).message}`); }
    if (!email) return;
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } }).catch(() => null);
    if (u) await this.mail.sendNotice(u.email, title, title, body, { label: 'Track your request', url: `${this.appUrl}${this.path(requestId)}` });
  }

  /** Every active admin, in-app and by email: these stall without a person. */
  private async notifyAdmins(title: string, body: string, requestId: string) {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true }, select: { id: true, email: true },
    }).catch(() => []);
    const link = `/admin/services/${requestId}`;
    await Promise.all(admins.map(async (a) => {
      try {
        await this.notifications.createNotification(a.id, 'SYSTEM_ANNOUNCEMENT', title, body, requestId, 'ServiceRequest', link);
      } catch (e) { this.logger.error(`Admin notify failed: ${(e as Error).message}`); }
      await this.mail.sendNotice(a.email, title, title, body, { label: 'Open request', url: `${this.appUrl}${link}` });
    }));
  }

  // ─── Customer ────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateServiceRequestDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, phone: true } });
    if (!user) throw new NotFoundException('User not found');

    // Only real, active catalogue services; anything else belongs in otherService.
    const active = await this.prisma.serviceCatalogItem.findMany({ where: { isActive: true }, select: { key: true, label: true } });
    const known = new Map(active.map((s) => [s.key, s.label]));
    const services = [...new Set(dto.services)].filter((k) => known.has(k));
    const other = dto.otherService?.trim() || null;
    if (services.length === 0 && !other) {
      throw new BadRequestException('Choose at least one service, or describe what you need under "Something else".');
    }

    const request = await this.prisma.serviceRequest.create({
      data: {
        number: await this.nextNumber(),
        userId,
        requesterType: dto.requesterType,
        services,
        otherService: other,
        propertyType: dto.propertyType ?? null,
        location: dto.location.trim(),
        address: dto.address?.trim() || null,
        preferredDate: dto.preferredDate ? new Date(dto.preferredDate) : null,
        timing: dto.timing?.trim() || null,
        scope: dto.scope?.trim() || null,
        budget: dto.budget?.trim() || null,
        details: dto.details.trim(),
        contactPhone: dto.contactPhone?.trim() || user.phone || null,
      },
    });
    await this.event(request.id, 'SUBMITTED', 'Request sent to the e-resi production team.', 'CUSTOMER');

    const due = new Date(request.createdAt.getTime() + QUOTE_SLA_MINUTES * 60_000);
    const what = [...services.map((k) => known.get(k)!), ...(other ? [other] : [])].join(', ');
    void this.notifyUser(
      userId,
      `We received your request ${request.number}`,
      `Thanks — we have your request for ${what} in ${request.location}. Your quote will reach your e-resi account and this inbox within 1 hour. You can follow it on your request page.`,
      request.id,
    );
    void this.notifyAdmins(
      `New service request ${request.number} — quote by ${fmtTime(due)}`,
      `${user.firstName} ${user.lastName} (${REQUESTER_LABEL[dto.requesterType] ?? dto.requesterType}) asked for ${what} in ${request.location}. `
        + `They were promised a quote within 1 hour, by ${fmtTime(due)} Nairobi time.`,
      request.id,
    );
    return request;
  }

  async mine(userId: string) {
    return this.prisma.serviceRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, number: true, status: true, services: true, otherService: true, location: true,
        quoteTotal: true, quoteCurrency: true, createdAt: true, updatedAt: true,
      },
      take: 100,
    });
  }

  private async withExtras<T extends ServiceRequest>(r: T) {
    const [events, invoice, catalog] = await Promise.all([
      this.prisma.serviceRequestEvent.findMany({ where: { requestId: r.id }, orderBy: { createdAt: 'asc' } }),
      r.invoiceId
        ? this.prisma.invoice.findUnique({
          where: { id: r.invoiceId },
          select: { id: true, number: true, status: true, total: true, currency: true, dueAt: true, paidAt: true, kind: true, issuedAt: true, receipt: { select: { number: true } } },
        })
        : null,
      this.prisma.serviceCatalogItem.findMany({ where: { key: { in: r.services } }, select: { key: true, label: true } }),
    ]);
    const labels = Object.fromEntries(catalog.map((c) => [c.key, c.label]));
    return {
      ...r,
      serviceLabels: r.services.map((k) => labels[k] ?? k),
      events,
      invoice,
      quoteDueBy: new Date(r.createdAt.getTime() + QUOTE_SLA_MINUTES * 60_000),
    };
  }

  private async ownOrThrow(id: string, userId: string) {
    const r = await this.prisma.serviceRequest.findUnique({ where: { id } });
    if (!r || r.userId !== userId) throw new NotFoundException('Request not found');
    return r;
  }

  async getMine(id: string, userId: string) {
    return this.withExtras(await this.ownOrThrow(id, userId));
  }

  async accept(id: string, userId: string) {
    const r = await this.ownOrThrow(id, userId);
    if (r.status !== 'QUOTED' || !r.quoteLines || r.quoteTotal == null) {
      throw new BadRequestException(r.status === 'ACCEPTED' ? 'This quote is already accepted.' : 'There is no quote to accept yet.');
    }
    if (r.quoteValidUntil && r.quoteValidUntil.getTime() < Date.now()) {
      throw new BadRequestException('This quote has expired. Request changes and we will send you a fresh one.');
    }

    // Claim the request first so a double click cannot raise two invoices.
    const claimed = await this.prisma.serviceRequest.updateMany({
      where: { id, status: 'QUOTED' },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });
    if (claimed.count === 0) throw new BadRequestException('This quote is already accepted.');

    try {
      // Held as a draft until it is linked, so the email and payment links
      // resolve to this request's page; then delivered at once.
      const invoice = await this.invoices.create({
        userId,
        kind: 'SERVICE_REQUEST',
        lines: r.quoteLines as unknown as DocumentLine[],
        currency: r.quoteCurrency ?? undefined,
        dueAt: new Date(Date.now() + day(INVOICE_TERMS_DAYS)),
        notes: `Production for request ${r.number} (quote ${r.quoteNumber})`,
        sendNow: false,
      });
      await this.prisma.serviceRequest.update({ where: { id }, data: { invoiceId: invoice.id } });
      await this.invoices.deliver(invoice.id);
      await this.event(id, 'ACCEPTED', `Quote ${r.quoteNumber} accepted.`, 'CUSTOMER');
      await this.event(id, 'INVOICED', `Invoice ${invoice.number} issued for ${money(invoice.total, invoice.currency)}, due ${fmtDate(invoice.dueAt)}.`, 'TEAM');
      void this.notifyAdmins(
        `Quote accepted — ${r.number}`,
        `The customer accepted quote ${r.quoteNumber}. Invoice ${invoice.number} for ${money(invoice.total, invoice.currency)} has been sent.`,
        id,
      );
    } catch (err) {
      // Put the quote back so they can try again rather than being stuck.
      await this.prisma.serviceRequest.update({ where: { id }, data: { status: 'QUOTED', acceptedAt: null } });
      throw err;
    }
    return this.getMine(id, userId);
  }

  async requestChanges(id: string, userId: string, message: string) {
    const r = await this.ownOrThrow(id, userId);
    if (r.status !== 'QUOTED') throw new BadRequestException('You can ask for changes once a quote has been sent.');
    await this.prisma.serviceRequest.update({
      where: { id },
      data: { status: 'CHANGES_REQUESTED', changeRequest: message.trim(), changesRequestedAt: new Date() },
    });
    await this.event(id, 'CHANGES_REQUESTED', `Asked for changes: “${message.trim()}”`, 'CUSTOMER');
    void this.notifyAdmins(`Changes requested — ${r.number}`, `The customer asked for changes to quote ${r.quoteNumber}: “${message.trim()}”`, id);
    return this.getMine(id, userId);
  }

  async cancel(id: string, userId: string) {
    const r = await this.ownOrThrow(id, userId);
    if (!QUOTABLE.includes(r.status)) throw new BadRequestException('This request can no longer be cancelled here. Contact support.');
    await this.prisma.serviceRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.event(id, 'CANCELLED', 'Request cancelled.', 'CUSTOMER');
    void this.notifyAdmins(`Request cancelled — ${r.number}`, 'The customer withdrew this request.', id);
    return this.getMine(id, userId);
  }

  // ─── The quote as a document ─────────────────────────────────────────────

  private async quoteDoc(r: ServiceRequest, forEmail: boolean): Promise<DocumentParams> {
    const u = await this.prisma.user.findUnique({
      where: { id: r.userId },
      select: { firstName: true, lastName: true, email: true, developerProfile: { select: { companyName: true } }, agentProfile: { select: { displayName: true } } },
    });
    const name = u?.developerProfile?.companyName ?? u?.agentProfile?.displayName ?? `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim();
    const url = `${this.appUrl}${this.path(r.id)}`;
    return {
      heading: 'Quotation',
      numberLabel: 'Quote',
      number: r.quoteNumber ?? r.number,
      billedToLabel: 'Prepared for',
      billedToName: name || 'Customer',
      billedToEmail: u?.email ?? '',
      lines: (r.quoteLines as unknown as DocumentLine[]) ?? [],
      subtotal: r.quoteSubtotal ?? 0,
      taxPercent: r.quoteTaxPercent ?? 0,
      taxAmount: r.quoteTaxAmount ?? 0,
      total: r.quoteTotal ?? 0,
      currency: r.quoteCurrency ?? 'KES',
      meta: [
        { label: 'Request', value: r.number },
        { label: 'Quoted', value: fmtDate(r.quotedAt ?? new Date()) },
        ...(r.quoteValidUntil ? [{ label: 'Valid until', value: fmtDate(r.quoteValidUntil) }] : []),
        { label: 'Location', value: r.location },
      ],
      intro: 'Here is our quote for your production request. Accept it to receive your invoice, payable by card or M-Pesa, or ask us to adjust it.',
      ...(r.quoteNotes && { callout: { tone: 'info' as const, text: r.quoteNotes } }),
      ...(forEmail && {
        cta: { label: 'Accept quote', url: `${url}?action=accept` },
        secondaryCta: { label: 'Request changes', url: `${url}?action=changes` },
      }),
      footnote: 'Prices are fixed for the validity period. Production is scheduled once the invoice is paid.',
    };
  }

  async quotePdf(id: string, userId?: string): Promise<{ filename: string; pdf: Buffer }> {
    const r = userId ? await this.ownOrThrow(id, userId) : await this.prisma.serviceRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Request not found');
    if (!r.quoteLines) throw new BadRequestException('No quote has been sent for this request yet.');
    return { filename: `${r.quoteNumber ?? r.number}.pdf`, pdf: await this.pdf.render(await this.quoteDoc(r, false)) };
  }

  // ─── Payment ─────────────────────────────────────────────────────────────

  private async onInvoicePaid(inv: Invoice) {
    const r = await this.prisma.serviceRequest.findUnique({ where: { invoiceId: inv.id } });
    if (!r || r.status === 'PAID') return;
    await this.prisma.serviceRequest.update({ where: { id: r.id }, data: { status: 'PAID', paidAt: inv.paidAt ?? new Date() } });
    await this.event(r.id, 'PAID', `Invoice ${inv.number} paid. We will be in touch to schedule production.`, 'CUSTOMER');
    void this.notifyUser(r.userId, `Payment received — ${r.number}`, 'Thank you. Your production is confirmed and our team will contact you to schedule it.', r.id, false);
    void this.notifyAdmins(`Paid — ${r.number}`, `Invoice ${inv.number} (${money(inv.total, inv.currency)}) is paid. Schedule production.`, r.id);
  }

  // ─── Admin ───────────────────────────────────────────────────────────────

  async adminList(status?: string, q?: string) {
    const where: Prisma.ServiceRequestWhereInput = {
      ...(status && status !== 'ALL' && { status: status as ServiceRequestStatus }),
      ...(q && {
        OR: [
          { number: { contains: q, mode: 'insensitive' } },
          { location: { contains: q, mode: 'insensitive' } },
          { user: { email: { contains: q, mode: 'insensitive' } } },
          { user: { firstName: { contains: q, mode: 'insensitive' } } },
          { user: { lastName: { contains: q, mode: 'insensitive' } } },
        ],
      }),
    };
    const [rows, counts] = await Promise.all([
      this.prisma.serviceRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      }),
      this.prisma.serviceRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return {
      rows: rows.map((r) => ({ ...r, quoteDueBy: new Date(r.createdAt.getTime() + QUOTE_SLA_MINUTES * 60_000) })),
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    };
  }

  async adminGet(id: string) {
    const r = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true } } },
    });
    if (!r) throw new NotFoundException('Request not found');
    // The quote template: one line per requested service, priced at the
    // catalogue's default as a starting point the team edits.
    const catalog = await this.prisma.serviceCatalogItem.findMany({
      where: { isActive: true }, orderBy: [{ category: 'asc' }, { order: 'asc' }],
      select: { key: true, label: true, price: true, currency: true, category: true },
    });
    return { ...(await this.withExtras(r)), user: r.user, catalog, taxRatePercent: Number(await this.pricing.getSetting('tax_rate_percent', '0')), currency: await this.pricing.platformCurrency() };
  }

  async sendQuote(id: string, adminId: string, dto: SendQuoteDto) {
    const r = await this.prisma.serviceRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Request not found');
    if (!QUOTABLE.includes(r.status)) throw new BadRequestException(`A ${r.status.toLowerCase().replace('_', ' ')} request cannot be re-quoted.`);

    const round = (n: number) => Math.round(n * 100) / 100;
    const lines: DocumentLine[] = dto.lines.map((l) => ({
      description: l.description.trim(), quantity: l.quantity, unitAmount: round(l.unitAmount), amount: round(l.quantity * l.unitAmount),
    }));
    const subtotal = round(lines.reduce((n, l) => n + l.amount, 0));
    const taxPercent = Number(await this.pricing.getSetting('tax_rate_percent', '0'));
    const taxAmount = round(subtotal * (taxPercent / 100));
    const version = r.quoteVersion + 1;
    const base = `QT-${r.number.slice(3)}`;
    const now = new Date();

    const updated = await this.prisma.serviceRequest.update({
      where: { id },
      data: {
        status: 'QUOTED',
        quoteNumber: version > 1 ? `${base}-${version}` : base,
        quoteVersion: version,
        quoteLines: lines as unknown as Prisma.InputJsonValue,
        quoteSubtotal: subtotal,
        quoteTaxPercent: taxPercent,
        quoteTaxAmount: taxAmount,
        quoteTotal: round(subtotal + taxAmount),
        quoteCurrency: await this.pricing.platformCurrency(),
        quoteNotes: dto.notes?.trim() || null,
        quoteValidUntil: new Date(now.getTime() + day(dto.validDays ?? DEFAULT_QUOTE_VALID_DAYS)),
        quotedAt: now,
        quotedById: adminId,
      },
    });
    await this.event(id, 'QUOTED', `${version > 1 ? 'Revised quote' : 'Quote'} ${updated.quoteNumber} sent: ${money(updated.quoteTotal!, updated.quoteCurrency!)}.`, 'TEAM');

    // In-app, then the emailed quote with its PDF and accept / change buttons.
    try {
      await this.notifications.createNotification(
        r.userId, 'SERVICE_REQUEST_UPDATED', `Your quote ${updated.quoteNumber} is ready`,
        `${money(updated.quoteTotal!, updated.quoteCurrency!)} for request ${r.number}. Accept it to get your invoice, or request changes.`,
        id, 'ServiceRequest', this.path(id),
      );
    } catch (e) { this.logger.error(`Quote notify failed: ${(e as Error).message}`); }
    const doc = await this.quoteDoc(updated, true);
    const pdf = await this.pdf.render(await this.quoteDoc(updated, false)).catch(() => null);
    const sent = await this.mail.sendDocument(
      doc.billedToEmail, `Your e-resi quote ${updated.quoteNumber}`, doc,
      pdf ? [{ filename: `${updated.quoteNumber}.pdf`, content: pdf }] : undefined,
    );
    return { ...(await this.adminGet(id)), emailSent: sent };
  }

  async adminSetStatus(id: string, status: 'IN_PRODUCTION' | 'DELIVERED' | 'DECLINED', note?: string) {
    const r = await this.prisma.serviceRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Request not found');
    const allowedFrom: Record<typeof status, ServiceRequestStatus[]> = {
      IN_PRODUCTION: ['PAID'],
      DELIVERED: ['PAID', 'IN_PRODUCTION'],
      DECLINED: ['SUBMITTED', 'QUOTED', 'CHANGES_REQUESTED'],
    };
    if (!allowedFrom[status].includes(r.status)) {
      throw new BadRequestException(`Cannot move a ${r.status.toLowerCase().replace('_', ' ')} request to ${status.toLowerCase().replace('_', ' ')}.`);
    }
    await this.prisma.serviceRequest.update({
      where: { id },
      data: { status, statusNote: note?.trim() || null, ...(status === 'DELIVERED' && { deliveredAt: new Date() }) },
    });
    const copy = {
      IN_PRODUCTION: ['Production has started', 'Our crew is on your job.'],
      DELIVERED: ['Your production is delivered', 'Your finished media is ready.'],
      DECLINED: ['We can’t take this request on', 'Sorry — we are not able to take this job on.'],
    }[status];
    await this.event(id, status, `${copy[0]}.${note ? ` ${note.trim()}` : ''}`, 'TEAM');
    void this.notifyUser(r.userId, `${copy[0]} — ${r.number}`, `${copy[1]}${note ? ` ${note.trim()}` : ''}`, id);
    return this.adminGet(id);
  }
}
