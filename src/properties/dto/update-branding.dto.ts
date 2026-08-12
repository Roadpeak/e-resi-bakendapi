import {
  IsArray,
  IsBoolean,
  IsHexColor,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Curated font pairings — kept in step with the frontend BRAND_FONTS. */
export const BRAND_FONT_KEYS = ['MODERN', 'LUXURY', 'MINIMAL', 'BOLD'] as const;
export const HERO_STYLE_KEYS = ['CINEMATIC', 'SPLIT', 'MINIMAL'] as const;

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
  @IsBoolean()
  whiteLabel?: boolean;
}
