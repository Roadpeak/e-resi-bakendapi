import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AgentSpecialty,
  KybStatus,
  PartnerInviteKind,
  PartnerInviteStatus,
  Prisma,
  type PartnerInvite,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import type { Response } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { resolveAppUrl } from '../common/app-url.js';
import { paginateMeta } from '../common/dto/pagination.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SITE_ZONE, subdomainProblem } from '../properties/custom-domain.js';
import type { AcceptInviteDto, CreateInviteDto, ListInvitesDto, UpdateInviteDto } from './dto/invites.dto.js';

const CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // no 0/o/1/l lookalikes

/** Specialties an invited agent starts with when they skip the picker. */
const DEFAULT_SPECIALTIES: AgentSpecialty[] = [
  AgentSpecialty.APARTMENT_RENTAL,
  AgentSpecialty.APARTMENT_PURCHASE,
  AgentSpecialty.VILLA_RENTAL,
  AgentSpecialty.VILLA_PURCHASE,
];

/**
 * Personal partner invites.
 *
 * The team creates one per agent or developer they want on the platform,
 * shares the link, and the invitee lands on a page written to them. Signing
 * up through it is the whole onboarding: no email code, no KYB documents —
 * the invite stands in for verification because a team member vouched for
 * them — and their e-resi website address is activated as they sign up.
 */
@Injectable()
export class InvitesService {
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.appUrl = resolveAppUrl(config);
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  private linkFor(code: string) {
    return `${this.appUrl}/invite/${code}`;
  }

  private shape(inv: PartnerInvite & { signedUpUser?: { id: string; firstName: string; lastName: string; email: string; role: string; agentProfile?: { id: string } | null; developerProfile?: { id: string } | null } | null; createdBy?: { firstName: string; lastName: string } | null }) {
    const { signedUpUser, createdBy, ...rest } = inv;
    return {
      ...rest,
      url: this.linkFor(inv.code),
      state: inv.status === PartnerInviteStatus.REVOKED ? 'revoked'
        : inv.signedUpAt ? 'signed_up'
          : inv.openedAt ? 'opened' : 'pending',
      createdBy: createdBy ? `${createdBy.firstName} ${createdBy.lastName}`.trim() : null,
      signedUpUser: signedUpUser ? {
        id: signedUpUser.id,
        name: `${signedUpUser.firstName} ${signedUpUser.lastName}`.trim(),
        email: signedUpUser.email,
        role: signedUpUser.role,
        agentProfileId: signedUpUser.agentProfile?.id ?? null,
        developerProfileId: signedUpUser.developerProfile?.id ?? null,
      } : null,
    };
  }

  private readonly include = {
    createdBy: { select: { firstName: true, lastName: true } },
    signedUpUser: {
      select: {
        id: true, firstName: true, lastName: true, email: true, role: true,
        agentProfile: { select: { id: true } },
        developerProfile: { select: { id: true } },
      },
    },
  } satisfies Prisma.PartnerInviteInclude;

  private async freshCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const bytes = randomBytes(10);
      let code = '';
      for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
      const clash = await this.prisma.partnerInvite.findUnique({ where: { code }, select: { id: true } });
      if (!clash) return code;
    }
    throw new ConflictException('Could not generate a unique invite code — try again');
  }

  async create(adminId: string, dto: CreateInviteDto) {
    if (dto.kind === PartnerInviteKind.AGENT && !dto.agentKind) {
      throw new BadRequestException('Say whether this agent is an agency or an individual');
    }
    const code = await this.freshCode();
    const inv = await this.prisma.partnerInvite.create({
      data: {
        code,
        kind: dto.kind,
        name: dto.name.trim(),
        contactName: dto.contactName?.trim() || null,
        email: dto.email?.trim().toLowerCase() || null,
        phone: dto.phone?.trim() || null,
        logoUrl: dto.logoUrl || null,
        message: dto.message.trim(),
        agentKind: dto.kind === PartnerInviteKind.AGENT ? dto.agentKind! : null,
        referrer: dto.referrer.trim(),
        notes: dto.notes?.trim() || null,
        createdById: adminId,
      },
      include: this.include,
    });
    return this.shape(inv);
  }

  async update(id: string, dto: UpdateInviteDto) {
    const inv = await this.prisma.partnerInvite.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Invite not found');
    const updated = await this.prisma.partnerInvite.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.contactName !== undefined && { contactName: dto.contactName?.trim() || null }),
        ...(dto.email !== undefined && { email: dto.email?.trim().toLowerCase() || null }),
        ...(dto.phone !== undefined && { phone: dto.phone?.trim() || null }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl || null }),
        ...(dto.message !== undefined && { message: dto.message.trim() }),
        ...(dto.agentKind !== undefined && { agentKind: dto.agentKind }),
        ...(dto.referrer !== undefined && { referrer: dto.referrer.trim() }),
        ...(dto.notes !== undefined && { notes: dto.notes?.trim() || null }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      include: this.include,
    });
    return this.shape(updated);
  }

  async remove(id: string) {
    const inv = await this.prisma.partnerInvite.findUnique({ where: { id }, select: { signedUpAt: true } });
    if (!inv) throw new NotFoundException('Invite not found');
    // A converted invite is the record of how that account joined; keep it.
    if (inv.signedUpAt) throw new BadRequestException('This invite was used to sign up and cannot be deleted. Revoke it instead.');
    await this.prisma.partnerInvite.delete({ where: { id } });
    return { message: 'Invite deleted' };
  }

  async get(id: string) {
    const inv = await this.prisma.partnerInvite.findUnique({ where: { id }, include: this.include });
    if (!inv) throw new NotFoundException('Invite not found');
    return this.shape(inv);
  }

  async list(query: ListInvitesDto) {
    const { kind, referrer, state, q } = query;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.PartnerInviteWhereInput = {
      ...(kind && { kind }),
      ...(referrer && { referrer: { equals: referrer, mode: 'insensitive' } }),
      ...(state === 'revoked' && { status: PartnerInviteStatus.REVOKED }),
      ...(state === 'signed_up' && { signedUpAt: { not: null } }),
      ...(state === 'opened' && { status: PartnerInviteStatus.ACTIVE, openedAt: { not: null }, signedUpAt: null }),
      ...(state === 'pending' && { status: PartnerInviteStatus.ACTIVE, openedAt: null }),
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { contactName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { referrer: { contains: q, mode: 'insensitive' } },
          { code: { equals: q } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.partnerInvite.findMany({
        where, include: this.include, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
      }),
      this.prisma.partnerInvite.count({ where }),
    ]);
    return { data: items.map((i) => this.shape(i)), meta: paginateMeta(total, page, limit) };
  }

  /**
   * Who signed up, per team member and per kind. Counts the whole table,
   * not the current filter, so the headline numbers do not shift as the
   * list is searched.
   */
  async stats() {
    const rows = await this.prisma.partnerInvite.findMany({
      select: { kind: true, status: true, referrer: true, openedAt: true, signedUpAt: true, openCount: true },
    });
    const bucket = () => ({ created: 0, opened: 0, signedUp: 0, agents: 0, developers: 0, opens: 0 });
    const total = bucket();
    const byReferrer = new Map<string, ReturnType<typeof bucket> & { referrer: string }>();
    const byKind = { AGENT: bucket(), DEVELOPER: bucket() };
    for (const r of rows) {
      const key = r.referrer.trim().toLowerCase();
      const ref = byReferrer.get(key) ?? { referrer: r.referrer.trim(), ...bucket() };
      for (const b of [total, ref, byKind[r.kind]]) {
        b.created += 1;
        b.opens += r.openCount;
        if (r.openedAt) b.opened += 1;
        if (r.signedUpAt) {
          b.signedUp += 1;
          if (r.kind === PartnerInviteKind.AGENT) b.agents += 1; else b.developers += 1;
        }
      }
      byReferrer.set(key, ref);
    }
    return {
      total,
      byKind,
      referrers: [...byReferrer.values()].sort((a, b) => b.signedUp - a.signedUp || b.created - a.created),
    };
  }

  // ─── Public (the invitee) ─────────────────────────────────────────────────

  private async activeByCode(code: string) {
    const inv = await this.prisma.partnerInvite.findUnique({ where: { code } });
    if (!inv || inv.status === PartnerInviteStatus.REVOKED) throw new NotFoundException('This invite link is no longer valid');
    return inv;
  }

  /**
   * What a shared link's preview needs (WhatsApp, iMessage, LinkedIn). Does
   * NOT count an open: link crawlers fetch this, not the invitee. Only
   * public-facing fields; no email, phone or referrer.
   */
  async preview(code: string) {
    const inv = await this.activeByCode(code);
    return { kind: inv.kind, name: inv.name, contactName: inv.contactName, logoUrl: inv.logoUrl, agentKind: inv.agentKind };
  }

  /** The welcome page's data. Counts the open; a used invite still renders, read-only. */
  async open(code: string) {
    const inv = await this.activeByCode(code);
    if (!inv.signedUpAt) {
      await this.prisma.partnerInvite.update({
        where: { id: inv.id },
        data: { openCount: { increment: 1 }, ...(!inv.openedAt && { openedAt: new Date() }) },
      }).catch(() => undefined);
    }
    return {
      code: inv.code,
      kind: inv.kind,
      name: inv.name,
      contactName: inv.contactName,
      email: inv.email,
      phone: inv.phone,
      logoUrl: inv.logoUrl,
      message: inv.message,
      agentKind: inv.agentKind,
      referrer: inv.referrer,
      signedUp: !!inv.signedUpAt,
    };
  }

  /** "Bora Property Agents" → "bora-property-agents", unique across agent sites and development subdomains. */
  private async freeHandle(name: string): Promise<string | null> {
    const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    if (base.length < 3) return null;
    for (let n = 0; n < 50; n++) {
      const candidate = n === 0 ? base : `${base}-${n + 1}`;
      if (subdomainProblem(candidate)) continue;
      const [agent, property] = await Promise.all([
        this.prisma.agentProfile.findFirst({ where: { siteHandle: candidate }, select: { id: true } }),
        this.prisma.property.findFirst({ where: { subdomain: candidate }, select: { id: true } }),
      ]);
      if (!agent && !property) return candidate;
    }
    return null;
  }

  /**
   * Complete signup through an invite. The account is created verified and
   * approved, with the agent's website live on an e-resi address, and the
   * response is a signed-in session so the next screen is their dashboard.
   */
  async accept(code: string, dto: AcceptInviteDto, res: Response) {
    const inv = await this.activeByCode(code);
    if (inv.signedUpAt) throw new GoneException('This invite has already been used to create an account');

    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new ConflictException('An account with this email already exists — sign in instead');
    }
    if (dto.phone && await this.prisma.user.findFirst({ where: { phone: dto.phone }, select: { id: true } })) {
      throw new ConflictException('Phone number already registered');
    }

    const name = (dto.name?.trim() || inv.name).trim();
    const isAgent = inv.kind === PartnerInviteKind.AGENT;
    const agentKind = dto.agentKind ?? inv.agentKind ?? 'INDIVIDUAL';
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const now = new Date();
    const handle = isAgent ? await this.freeHandle(name) : null;

    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email,
          password: passwordHash,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          phone: dto.phone || inv.phone || undefined,
          role: isAgent ? 'AGENT' : 'DEVELOPER',
          // Personally invited: the team vouches for the address, so no code.
          emailVerified: true,
          // Individuals lead with a picture; it doubles as the account photo.
          avatarUrl: isAgent && agentKind === 'INDIVIDUAL' ? inv.logoUrl : undefined,
        },
      });

      if (isAgent) {
        await tx.agentProfile.create({
          data: {
            userId: u.id,
            kind: agentKind,
            displayName: name,
            specialties: dto.specialties?.length ? dto.specialties : DEFAULT_SPECIALTIES,
            logoUrl: agentKind === 'COMPANY' ? inv.logoUrl : null,
            photoUrl: agentKind === 'INDIVIDUAL' ? inv.logoUrl : null,
            phone: dto.phone || inv.phone || null,
            email,
            // The invite is the verification.
            kybStatus: KybStatus.APPROVED,
            kybReviewedAt: now,
            kybReviewedBy: inv.createdById,
            isListed: true,
            // Their free website, live immediately.
            ...(handle && { siteHandle: handle, siteActivatedAt: now }),
          },
        });
      } else {
        await tx.developerProfile.create({
          data: {
            userId: u.id,
            companyName: name,
            logoUrl: inv.logoUrl,
            phone: dto.phone || inv.phone || null,
            email,
            kybStatus: KybStatus.APPROVED,
            kybReviewedAt: now,
            kybReviewedBy: inv.createdById,
            onboardingSubmittedAt: now,
            onboarding: { via: 'partner-invite', inviteId: inv.id, referrer: inv.referrer },
          },
        });
      }

      await tx.partnerInvite.update({
        where: { id: inv.id },
        data: { signedUpAt: now, signedUpUserId: u.id },
      });
      return u;
    });

    const session = await this.auth.issueSession(user, res);
    return {
      ...session,
      kind: inv.kind,
      siteUrl: handle ? `https://${handle}.${SITE_ZONE}` : null,
      next: isAgent ? '/agent?welcome=1' : '/dashboard?welcome=1',
    };
  }
}
