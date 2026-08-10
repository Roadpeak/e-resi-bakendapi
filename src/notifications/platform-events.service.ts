import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsService } from './notifications.service.js';
import { resolveAppUrl } from '../common/app-url.js';

/**
 * One place where "something happened" becomes a notification.
 *
 * Every method delivers both an in-app notification and an email, and none of
 * them throw: a failed notification must never roll back the action that
 * caused it. Callers therefore do not need to wrap these in try/catch.
 *
 * Admin-facing events fan out to every active admin, so adding an
 * administrator is enough to put them on the distribution list.
 */
@Injectable()
export class PlatformEventsService {
  private readonly logger = new Logger(PlatformEventsService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.appUrl = resolveAppUrl(config);
  }

  // ─── Delivery primitives ─────────────────────────────────────────────────

  /** Notify one user in-app and by email. Swallows failures by design. */
  private async toUser(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    opts: {
      email?: boolean;
      cta?: { label: string; path: string };
      resourceId?: string;
      resourceType?: string;
    } = {},
  ): Promise<void> {
    try {
      await this.notifications.createNotification(
        userId, type, title, body, opts.resourceId, opts.resourceType,
      );
    } catch (err) {
      this.logger.error(`In-app notify failed for ${userId}: ${(err as Error).message}`);
    }

    if (opts.email === false) return;
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      if (!user) return;
      await this.mail.sendNotice(
        user.email,
        title,
        title,
        body,
        opts.cta ? { label: opts.cta.label, url: `${this.appUrl}${opts.cta.path}` } : undefined,
      );
    } catch (err) {
      this.logger.error(`Email notify failed for ${userId}: ${(err as Error).message}`);
    }
  }

  /**
   * Notify every active admin. Suspended admins are excluded — they have lost
   * access, so mailing them about work they cannot action is noise.
   */
  private async toAdmins(
    title: string,
    body: string,
    cta?: { label: string; path: string },
    resource?: { id: string; type: string },
    /**
     * Public traffic — inquiries, viewings, reservations — arrives far too
     * often to email every admin each time. Those land in-app only, where the
     * queue is the right surface. Reserve email for things that stall without
     * a person: a submission to review, a payment that failed.
     */
    email = true,
  ): Promise<void> {
    let admins: { id: string }[] = [];
    try {
      admins = await this.prisma.user.findMany({
        where: { role: 'ADMIN', isActive: true },
        select: { id: true },
      });
    } catch (err) {
      this.logger.error(`Could not load admins: ${(err as Error).message}`);
      return;
    }

    await Promise.all(admins.map((a) => this.toUser(
      a.id,
      'SYSTEM_ANNOUNCEMENT',
      title,
      body,
      { cta, email, resourceId: resource?.id, resourceType: resource?.type },
    )));
  }

  // ─── Developer-facing ────────────────────────────────────────────────────

  /** A listing went live. */
  async propertyApproved(userId: string, property: { id: string; name: string; slug: string }) {
    await this.toUser(
      userId,
      'PROPERTY_PUBLISHED',
      `${property.name} is live`,
      `${property.name} has been approved and is now visible to buyers on e-resi. `
      + 'Listing fees apply from the next billing period while it stays live.',
      {
        cta: { label: 'View listing', path: `/${property.slug}` },
        resourceId: property.id,
        resourceType: 'Property',
      },
    );
  }

  /** A listing was sent back. The reason is the whole point of the message. */
  async propertyRejected(
    userId: string,
    property: { id: string; name: string },
    reason?: string | null,
  ) {
    await this.toUser(
      userId,
      'GENERAL',
      `${property.name} needs changes`,
      reason
        ? `${property.name} was not approved: ${reason}`
        : `${property.name} was not approved. Please review the listing and resubmit.`,
      {
        cta: { label: 'Edit listing', path: '/dashboard/developments' },
        resourceId: property.id,
        resourceType: 'Property',
      },
    );
  }

  async kybApproved(userId: string, companyName: string) {
    await this.toUser(
      userId,
      'KYB_APPROVED',
      'Your account is verified',
      `${companyName} has been verified. You can now publish developments on e-resi.`,
      { cta: { label: 'Add a development', path: '/dashboard/developments' } },
    );
  }

  async kybRejected(userId: string, companyName: string, reason?: string | null) {
    await this.toUser(
      userId,
      'KYB_REJECTED',
      'Verification needs attention',
      reason
        ? `${companyName} could not be verified: ${reason}`
        : `${companyName} could not be verified. Please review your submitted documents.`,
      { cta: { label: 'Update details', path: '/dashboard/settings' } },
    );
  }

  /** Ops booked a crew for an ordered service. */
  async productionScheduled(
    userId: string,
    order: { id: string; label: string; scheduledAt: Date },
    propertyName: string,
  ) {
    const when = order.scheduledAt.toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    await this.toUser(
      userId,
      'GENERAL',
      `${order.label} booked for ${when}`,
      `Our crew is scheduled to carry out ${order.label.toLowerCase()} at ${propertyName} on ${when}. `
      + 'Please make sure site access is arranged.',
      { cta: { label: 'View production', path: '/dashboard/billing' }, resourceId: order.id, resourceType: 'ProductionOrder' },
    );
  }

  /**
   * A booked date moved. Distinct from productionScheduled so the developer
   * sees what changed rather than a second "booked" notice — they may already
   * have arranged site access around the original date.
   */
  async productionRescheduled(
    userId: string,
    order: { id: string; label: string; scheduledAt: Date; previousDate: Date | null },
    propertyName: string,
  ) {
    const fmt = (d: Date) => d.toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const when = fmt(order.scheduledAt);
    await this.toUser(
      userId,
      'GENERAL',
      `${order.label} moved to ${when}`,
      (order.previousDate
        ? `${order.label} at ${propertyName} has moved from ${fmt(order.previousDate)} to ${when}. `
        : `${order.label} at ${propertyName} is now booked for ${when}. `)
      + 'Please make sure site access is arranged for the new date.',
      { cta: { label: 'View production', path: '/dashboard/billing' }, resourceId: order.id, resourceType: 'ProductionOrder' },
    );
  }

  async productionDelivered(userId: string, order: { id: string; label: string }, propertyName: string) {
    await this.toUser(
      userId,
      'GENERAL',
      `${order.label} delivered`,
      `${order.label} for ${propertyName} is complete and the media is now on your listing.`,
      { cta: { label: 'View listing', path: '/dashboard/developments' }, resourceId: order.id, resourceType: 'ProductionOrder' },
    );
  }

  // ─── Admin-facing ────────────────────────────────────────────────────────

  async developerSubmittedKyb(companyName: string, profileId: string) {
    await this.toAdmins(
      'New verification to review',
      `${companyName} has submitted their onboarding and documents for verification.`,
      { label: 'Review submission', path: `/admin/developers/${profileId}` },
      { id: profileId, type: 'DeveloperProfile' },
    );
  }

  /** An agent is waiting on document review — the queue is otherwise poll-only. */
  async agentKycSubmitted(displayName: string, agentId: string) {
    await this.toAdmins(
      'Agent awaiting verification',
      `${displayName} submitted verification documents for review.`,
      { label: 'Review agent', path: '/admin/agents?status=PENDING' },
      { id: agentId, type: 'AgentProfile' },
    );
  }

  /**
   * Outcome of that review. A rejection carries the reason, since the agent
   * cannot fix anything without knowing what failed.
   */
  async agentKycReviewed(
    userId: string,
    displayName: string,
    status: 'APPROVED' | 'REJECTED' | string,
    rejectionReason?: string,
  ) {
    const approved = status === 'APPROVED';
    await this.toUser(
      userId,
      'GENERAL',
      approved ? 'Your agent account is verified' : 'Verification needs attention',
      approved
        ? `${displayName} is verified and now listed in the e-resi agent directory.`
        : `We could not verify ${displayName}. ${rejectionReason ?? ''} `
          + 'Update your documents and submit again.',
      {
        cta: { label: approved ? 'View my profile' : 'Update documents', path: '/agent/profile' },
      },
    );
  }

  async propertySubmitted(propertyName: string, companyName: string, propertyId: string) {
    await this.toAdmins(
      'New listing awaiting review',
      `${companyName} submitted ${propertyName} for review.`,
      { label: 'Review listing', path: '/admin/properties?status=DRAFT' },
      { id: propertyId, type: 'Property' },
    );
  }

  async productionOrdered(
    propertyName: string,
    companyName: string,
    services: { label: string; amount: number; currency: string }[],
  ) {
    if (!services.length) return;
    const total = services.reduce((n, s) => n + s.amount, 0);
    const currency = services[0].currency;
    await this.toAdmins(
      `Production ordered — ${propertyName}`,
      `${companyName} ordered ${services.map((s) => s.label).join(', ')} `
      + `for ${propertyName} (${currency} ${total.toLocaleString()}). Needs scheduling.`,
      { label: 'Open production queue', path: '/admin/production' },
    );
  }

  async paymentFailed(companyName: string, amount: number, currency: string, reason: string) {
    await this.toAdmins(
      'A payment failed',
      `${companyName}: ${currency} ${amount.toLocaleString()} could not be collected — ${reason}.`,
      { label: 'Open billing', path: '/admin/billing' },
    );
  }

  async newInquiry(propertyName: string, fromName: string, inquiryId: string) {
    await this.toAdmins(
      `New inquiry on ${propertyName}`,
      `${fromName} sent an inquiry about ${propertyName}.`,
      { label: 'Open inquiries', path: '/admin/rentals' },
      { id: inquiryId, type: 'Inquiry' },
      false,
    );
  }

  async newReservation(propertyName: string, unitLabel: string, byName: string, reservationId: string) {
    await this.toAdmins(
      `Unit reserved — ${propertyName}`,
      `${byName} reserved ${unitLabel} at ${propertyName}.`,
      { label: 'Open reservations', path: '/admin/rentals' },
      { id: reservationId, type: 'Reservation' },
      false,
    );
  }

  async newBooking(propertyName: string, byName: string, bookingId: string) {
    await this.toAdmins(
      `Viewing booked — ${propertyName}`,
      `${byName} booked a viewing at ${propertyName}.`,
      { label: 'Open bookings', path: '/admin/rentals' },
      { id: bookingId, type: 'Booking' },
      false,
    );
  }

  async newDeveloperSignup(companyName: string, email: string) {
    await this.toAdmins(
      'New developer account',
      `${companyName} (${email}) created a developer account.`,
      { label: 'Open developers', path: '/admin/developers' },
    );
  }
}
