import {
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  IsArray,
  IsBoolean,
  IsHexColor,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Curated font pairings — kept in step with the frontend BRAND_FONTS. */
export const BRAND_FONT_KEYS = ['MODERN', 'LUXURY', 'MINIMAL', 'BOLD'] as const;
/**
 * Mini-site template keys — kept in step with the frontend
 * MINI_SITE_TEMPLATES. Enumerated rather than free-form for the same reason as
 * fonts: an unknown key would fall back silently and the developer would be
 * left wondering why their choice did nothing.
 */
export const TEMPLATE_KEYS = [
  'CLASSIC', 'EDITORIAL', 'CONFIDENT', 'STATEMENT',
  'LUXE_DARK', 'SHOWCASE', 'ARCHITECTURAL', 'WARM_LUXE',
] as const;
export const HERO_STYLE_KEYS = ['CINEMATIC', 'SPLIT', 'MINIMAL'] as const;
export const NAVBAR_STYLE_KEYS = ['SOLID', 'FLOATING'] as const;
export const NAVBAR_THEME_KEYS = ['LIGHT', 'DARK', 'BRAND'] as const;

/**
 * Copy overrides for a single section.
 *
 * Every field optional: blank falls back to the template's own wording, which
 * is what keeps an existing development rendering unchanged.
 */
export class SectionCopyDto {
  @ApiPropertyOptional({ example: 'Available residences' })
  @IsOptional()
  @IsString()
  // Long enough for a real heading, short enough that it cannot become a
  // paragraph the template's type scale was never designed to carry.
  @MaxLength(80, { message: 'Keep section headings short enough to read as a heading' })
  heading?: string;

  @ApiPropertyOptional({ example: 'Six layouts, from studios to four-bedroom penthouses.' })
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Keep the intro under 300 characters' })
  body?: string;

  @ApiPropertyOptional({ example: 'Download price list' })
  @IsOptional()
  @IsString()
  @MaxLength(40, { message: 'Keep the button label short enough to fit a button' })
  ctaLabel?: string;

  @ApiPropertyOptional({ example: 'https://example.com/prices.pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  // Only absolute http(s) links, a mailto/tel, or an in-page anchor. A bare
  // path would be ambiguous on a custom domain, and allowing arbitrary schemes
  // here would put javascript: one save away from every buyer's browser.
  @Matches(/^(https?:\/\/|mailto:|tel:|#)/i, {
    message: 'Links must start with https://, http://, mailto:, tel: or #',
  })
  ctaHref?: string;
}

/** Fields a developer may override, and how long each may be. */
const COPY_LIMITS: Record<string, number> = {
  heading: 80,
  body: 300,
  ctaLabel: 40,
  ctaHref: 500,
};

const LINK_PATTERN = /^(https?:\/\/|mailto:|tel:|#)/i;

/**
 * Shape check for the section-copy map.
 *
 * Enforces the same limits the nested DTO documents — the DTO stays as the
 * Swagger contract, this is what actually runs.
 */
@ValidatorConstraint({ name: 'isSectionCopyMap', async: false })
export class IsSectionCopyMap implements ValidatorConstraintInterface {
  private reason = 'sectionCopy is malformed';

  validate(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value !== 'object' || Array.isArray(value)) {
      this.reason = 'sectionCopy must be an object keyed by section id';
      return false;
    }

    for (const [sectionId, fields] of Object.entries(value as Record<string, unknown>)) {
      // Section ids are used as object keys and rendered as anchors, so keep
      // them to the same shape the frontend's SECTIONS list uses.
      if (!/^[a-z0-9][a-z0-9_-]{0,40}$/i.test(sectionId)) {
        this.reason = `"${sectionId}" is not a valid section id`;
        return false;
      }
      if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
        this.reason = `sectionCopy.${sectionId} must be an object`;
        return false;
      }

      for (const [key, raw] of Object.entries(fields as Record<string, unknown>)) {
        const limit = COPY_LIMITS[key];
        if (limit === undefined) {
          this.reason = `sectionCopy.${sectionId}.${key} is not an editable field`;
          return false;
        }
        if (typeof raw !== 'string') {
          this.reason = `sectionCopy.${sectionId}.${key} must be text`;
          return false;
        }
        if (raw.length > limit) {
          this.reason = `sectionCopy.${sectionId}.${key} must be ${limit} characters or fewer`;
          return false;
        }
        // Only checked when there is something to check: a cleared field is
        // how a developer removes a button.
        if (key === 'ctaHref' && raw.trim() && !LINK_PATTERN.test(raw.trim())) {
          this.reason = 'Links must start with https://, http://, mailto:, tel: or #';
          return false;
        }
      }
    }
    return true;
  }

  defaultMessage(): string {
    return this.reason;
  }
}

/**
 * Mini-site branding for one development.
 *
 * Separate from UpdatePropertyDto because these are presentation settings
 * rather than listing facts: they are edited from a different screen, by a
 * different mental model, and validated far more tightly. Fonts and hero
 * styles are enumerated rather than free-form — a bad font would undermine a
 * tour the developer paid six figures for.
 */
export class UpdateBrandingDto {
  @ApiPropertyOptional({ example: '#1a73e8', description: 'Brand accent as #rrggbb' })
  @IsOptional()
  @IsHexColor({ message: 'brandColor must be a hex colour like #1a73e8' })
  brandColor?: string;

  @ApiPropertyOptional({ enum: BRAND_FONT_KEYS })
  @IsOptional()
  @IsIn(BRAND_FONT_KEYS as unknown as string[])
  brandFont?: string;

  @ApiPropertyOptional({ enum: TEMPLATE_KEYS })
  @IsOptional()
  @IsIn(TEMPLATE_KEYS as unknown as string[])
  templateKey?: string;

  @ApiPropertyOptional({ enum: HERO_STYLE_KEYS })
  @IsOptional()
  @IsIn(HERO_STYLE_KEYS as unknown as string[])
  heroStyle?: string;

  @ApiPropertyOptional({ type: [String], description: 'Section ids in display order' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sectionOrder?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Section ids to hide' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenSections?: string[];

  @ApiPropertyOptional({
    description: 'Per-section copy overrides, keyed by section id',
    example: { units: { heading: 'Available residences', ctaLabel: 'Price list', ctaHref: '#booking' } },
  })
  @IsOptional()
  @IsObject()
  // Validated by hand rather than with @ValidateNested. The keys here are
  // section ids, not declared properties, so the global whitelisting pipe
  // rejected every one of them as "should not exist" — which made the whole
  // feature un-saveable. A custom rule checks the shape without the pipe ever
  // treating the ids as unexpected fields.
  @Validate(IsSectionCopyMap)
  sectionCopy?: Record<string, SectionCopyDto>;

  @ApiPropertyOptional({ enum: NAVBAR_STYLE_KEYS })
  @IsOptional()
  @IsIn(NAVBAR_STYLE_KEYS as unknown as string[])
  navbarStyle?: string;

  @ApiPropertyOptional({ enum: NAVBAR_THEME_KEYS })
  @IsOptional()
  @IsIn(NAVBAR_THEME_KEYS as unknown as string[])
  navbarTheme?: string;

  @ApiPropertyOptional({ description: 'Keep the gradient overlay on the hero image' })
  @IsOptional()
  // The global pipe runs with enableImplicitConversion, which coerces any
  // non-empty string to `true` — so "maybe" silently turned the overlay ON
  // instead of being rejected. Convert explicitly from the values a client can
  // legitimately send, and leave anything else as-is so @IsBoolean rejects it.
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return value;
  })
  @IsBoolean()
  heroOverlay?: unknown;

  @ApiPropertyOptional({ example: 'Book a viewing' })
  @IsOptional()
  @IsString()
  @MaxLength(40, { message: 'Keep the call to action short enough to fit a button' })
  ctaLabel?: string;

  @ApiPropertyOptional({ example: 'tours.developer.co.ke' })
  @IsOptional()
  @IsString()
  @MaxLength(253)
  // Hostname only — a full URL or a path would silently never route.
  @Matches(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i, {
    message: 'customDomain must be a bare hostname, e.g. tours.developer.co.ke',
  })
  customDomain?: string;

  @ApiPropertyOptional({ description: 'Remove e-resi attribution (top tier only)' })
  @IsOptional()
  // Same implicit-conversion hazard as heroOverlay above. It matters more
  // here: this is a paid tier, so a stray string must not read as "enabled".
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return value;
  })
  @IsBoolean()
  whiteLabel?: unknown;
}
