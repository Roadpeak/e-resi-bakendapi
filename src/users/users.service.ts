import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KybStatus, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../media/storage.service.js';
import { PlatformEventsService } from '../notifications/platform-events.service.js';
import { PaginationDto, paginateMeta } from '../common/dto/pagination.dto.js';
import type { SubmitOnboardingDto } from './dto/submit-onboarding.dto.js';
import type { UpdateDeveloperProfileDto } from './dto/update-developer-profile.dto.js';

/** The documents a developer can upload, and which ones the documents route requires. */
const VERIFICATION_DOCS = ['registrationCert', 'taxCert', 'directorId', 'proofOfAddress', 'companyLogo', 'brandAssets'] as const;
const REQUIRED_DOCS = ['registrationCert', 'taxCert', 'directorId'] as const;
const DOC_MIME = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif)|application\/zip|application\/x-zip-compressed)$/;

/** Links a developer can offer instead of documents. */
const VERIFICATION_LINKS = ['website', 'facebook', 'instagram', 'linkedin', 'x', 'tiktok', 'youtube', 'other'] as const;

function cleanUrl(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const raw = v.trim();
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.includes('.') ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * What a developer submitted to prove the company is real — either the legal
 * documents (stored privately) or public links an admin can check by hand.
 * Throws when the chosen route is incomplete, so a submission never reaches
 * the review queue with nothing to review.
 */
function normaliseVerification(input: unknown, profileId: string) {
  const v = (input ?? {}) as Record<string, unknown>;
  const method = v.method === 'links' ? 'links' : 'documents';

  if (method === 'links') {
    const given = (v.links ?? {}) as Record<string, unknown>;
    const links: Record<string, string> = {};
    for (const k of VERIFICATION_LINKS) {
      const url = cleanUrl(given[k]);
      if (url) links[k] = url;
    }
    if (!Object.keys(links).length) {
      throw new BadRequestException('Add at least one valid website or social media link to verify your company.');
    }
    return { method, links };
  }

  const given = (v.documents ?? {}) as Record<string, unknown>;
  const documents: Record<string, { key: string; name: string; size?: number }> = {};
  for (const k of VERIFICATION_DOCS) {
    const d = given[k] as { key?: unknown; name?: unknown; size?: unknown } | undefined;
    // Only keys this API issued to this developer — never an arbitrary URL,
    // a path escape, or another developer's file.
    if (
      d && typeof d.key === 'string'
      && /^(spaces|local)-private:/.test(d.key)
      && d.key.includes(`kyb/${profileId}/`)
      && !d.key.includes('..')
    ) {
      documents[k] = {
        key: d.key,
        name: typeof d.name === 'string' ? d.name.slice(0, 200) : k,
        ...(typeof d.size === 'number' && { size: d.size }),
      };
    }
  }
  const missing = REQUIRED_DOCS.filter((k) => !documents[k]);
  if (missing.length) {
    throw new BadRequestException(
      'Upload your business registration certificate, tax compliance certificate and a director ID, or verify with links instead.',
    );
  }
  return { method, documents };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PlatformEventsService,
    private readonly storage: StorageService,
  ) {}

  // ─── Admin: list all users ────────────────────────────────────────────────

  async findAll(pagination: PaginationDto, role?: UserRole) {
    const where = role ? { role } : {};
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          phone: true,
          avatarUrl: true,
          emailVerified: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          developerProfile: { select: { companyName: true, kybStatus: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: pagination.page ?? 1,
        limit: pagination.limit ?? 20,
        totalPages: Math.ceil(total / (pagination.limit ?? 20)),
      },
    };
  }

  // ─── Admin: get single user ───────────────────────────────────────────────

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { developerProfile: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const { password, refreshToken, emailVerifyToken, passwordResetToken, passwordResetExpiry, ...safe } = user;
    return safe;
  }

  // ─── Admin: toggle active ─────────────────────────────────────────────────

  async setActive(id: string, isActive: boolean) {
    await this.findOne(id);
    const updated = await this.prisma.user.update({ where: { id }, data: { isActive } });
    return { id: updated.id, isActive: updated.isActive };
  }

  // ─── Admin: update KYB status ─────────────────────────────────────────────

  async updateKybStatus(developerId: string, status: KybStatus) {
    const profile = await this.prisma.developerProfile.findUnique({ where: { id: developerId } });
    if (!profile) throw new NotFoundException('Developer profile not found');
    return this.prisma.developerProfile.update({
      where: { id: developerId },
      data: { kybStatus: status, kybReviewedAt: new Date() },
    });
  }

  // ─── Developer: get own profile ───────────────────────────────────────────

  async getMyDeveloperProfile(userId: string) {
    const profile = await this.prisma.developerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Developer profile not found');
    return profile;
  }

  // ─── Developer: update own profile ───────────────────────────────────────

  async updateMyDeveloperProfile(userId: string, dto: UpdateDeveloperProfileDto) {
    const profile = await this.prisma.developerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Developer profile not found');
    return this.prisma.developerProfile.update({
      where: { userId },
      data: {
        ...(dto.companyName !== undefined && { companyName: dto.companyName }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.establishedYear !== undefined && { establishedYear: dto.establishedYear }),
        ...(dto.website !== undefined && { website: dto.website }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.whatsapp !== undefined && { whatsapp: dto.whatsapp }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.socials !== undefined && { socials: dto.socials as object }),
      },
    });
  }

  async uploadVerificationDoc(userId: string, docKey: string, file: Express.Multer.File) {
    const profile = await this.prisma.developerProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException('Developer profile not found');
    if (!(VERIFICATION_DOCS as readonly string[]).includes(docKey)) {
      throw new BadRequestException('Unknown document type');
    }
    if (!file) throw new BadRequestException('No file uploaded');
    if (!DOC_MIME.test(file.mimetype)) {
      throw new BadRequestException('Upload a PDF, image (JPG, PNG) or ZIP file.');
    }
    const stored = await this.storage.uploadPrivate(`kyb/${profile.id}`, file.originalname, file.buffer, file.mimetype);
    return { key: stored.key, name: file.originalname, size: stored.sizeBytes };
  }

  async submitOnboarding(userId: string, dto: SubmitOnboardingDto) {
    const profile = await this.prisma.developerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Developer profile not found');

    // Already-approved developers re-submitting their profile aren't asked to
    // prove themselves again.
    const verification = profile.kybStatus === KybStatus.APPROVED && !dto.verificationDocs
      ? null
      : normaliseVerification(dto.verificationDocs, profile.id);

    // Links offered for verification double as the public profile's website
    // and socials, unless the developer already set those.
    const links: Record<string, string> = verification?.method === 'links' ? verification.links ?? {} : {};
    const existingSocials = (profile.socials ?? {}) as Record<string, string>;
    const socialKeys: Record<string, string> = { facebook: 'facebook', instagram: 'instagram', linkedin: 'linkedin', x: 'twitter', tiktok: 'tiktok' };
    const socials = { ...existingSocials };
    for (const [from, to] of Object.entries(socialKeys)) {
      if (links[from] && !socials[to]) socials[to] = links[from];
    }

    const company = dto.company as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const year = Number.parseInt(String(company.yearEstablished ?? ''), 10);
    const projects = Number.parseInt(String(company.projectsCompleted ?? ''), 10);

    const updated = await this.prisma.developerProfile.update({
      where: { userId },
      data: {
        // promote known company fields onto the profile columns
        ...(str(company.companyName) && { companyName: str(company.companyName)! }),
        ...(str(company.longDescription ?? company.shortDescription) && {
          description: str(company.longDescription ?? company.shortDescription)!,
        }),
        ...(Number.isFinite(year) && year >= 1900 && { establishedYear: year }),
        ...(Number.isFinite(projects) && projects >= 0 && { completedProjects: projects }),
        ...(str(company.website)
          ? { website: str(company.website)! }
          : links.website && !profile.website && { website: links.website }),
        ...(Object.keys(socials).length > Object.keys(existingSocials).length && { socials }),
        // The logo is uploaded during the wizard; only an https URL is accepted.
        ...(typeof company.logoUrl === 'string'
          && /^https:\/\/\S+$/.test(company.logoUrl)
          && company.logoUrl.length <= 1000
          && { logoUrl: company.logoUrl }),
        // full wizard payload for admin review
        onboarding: dto as unknown as object,
        onboardingSubmittedAt: new Date(),
        ...(verification && { kybDocuments: verification as object }),
        // (re)enter the KYB review queue unless already approved
        ...(profile.kybStatus !== KybStatus.APPROVED && { kybStatus: KybStatus.PENDING }),
      },
    });

    // Nothing else tells an admin a submission is waiting; the KYB queue was
    // poll-only before this.
    if (profile.kybStatus !== KybStatus.APPROVED) {
      await this.events.developerSubmittedKyb(updated.companyName, updated.id);
    }

    return updated;
  }

  // ─── Public: get developer profile by userId ─────────────────────────────

  /**
   * Never on a public profile: the onboarding answers carry the tax PIN,
   * registration number and private contacts, and kybDocuments the
   * verification documents or links.
   */
  private static readonly PRIVATE_PROFILE_FIELDS = {
    onboarding: true,
    kybDocuments: true,
    kybReviewedBy: true,
  } as const;

  async getDeveloperProfileByUserId(userId: string) {
    const profile = await this.prisma.developerProfile.findUnique({
      where: { userId },
      omit: UsersService.PRIVATE_PROFILE_FIELDS,
      include: {
        properties: {
          where: { status: 'ACTIVE' },
          select: {
            id: true, slug: true, name: true, heroImageUrl: true, city: true,
            neighborhood: true, priceFrom: true, priceTo: true, currency: true,
            latitude: true, longitude: true, category: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!profile) throw new NotFoundException('Developer profile not found');
    return profile;
  }

  /**
   * Same shape as getDeveloperProfileByUserId, but keyed by the profile's own
   * id — the id the public directory (listPublicDevelopers) actually hands
   * back, so the detail page does not need to know a userId at all.
   */
  async getPublicDeveloperProfile(profileId: string) {
    const profile = await this.prisma.developerProfile.findUnique({
      where: { id: profileId },
      omit: UsersService.PRIVATE_PROFILE_FIELDS,
      include: {
        properties: {
          where: { status: 'ACTIVE' },
          select: {
            id: true, slug: true, name: true, heroImageUrl: true, city: true,
            neighborhood: true, priceFrom: true, priceTo: true, currency: true,
            latitude: true, longitude: true, category: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    // A developer whose KYB was rejected, or who has yet to be approved, is
    // not something a buyer should be able to browse to directly.
    if (!profile || profile.kybStatus !== 'APPROVED') {
      throw new NotFoundException('Developer not found');
    }
    return profile;
  }

  /**
   * Public directory — every KYB-approved developer with at least one live
   * listing. Developers with zero active properties are excluded: a card
   * whose Explore button leads to an empty grid is a dead end, not a listing.
   */
  async listPublicDevelopers(pagination: PaginationDto) {
    const where = {
      kybStatus: 'APPROVED' as const,
      properties: { some: { status: 'ACTIVE' as const } },
    };
    const [data, total] = await Promise.all([
      this.prisma.developerProfile.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { completedProjects: 'desc' },
        select: {
          id: true, companyName: true, logoUrl: true, location: true,
          phone: true, whatsapp: true, establishedYear: true, completedProjects: true,
          // The newest live development's hero doubles as the card's cover —
          // a developer is best introduced by what they have actually built.
          properties: {
            where: { status: 'ACTIVE', heroImageUrl: { not: null } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { heroImageUrl: true },
          },
          _count: { select: { properties: { where: { status: 'ACTIVE' } } } },
        },
      }),
      this.prisma.developerProfile.count({ where }),
    ]);
    return {
      data: data.map(({ properties, ...d }) => ({
        ...d,
        coverImageUrl: properties[0]?.heroImageUrl ?? null,
      })),
      meta: paginateMeta(total, pagination.page ?? 1, pagination.limit ?? 20),
    };
  }
}
