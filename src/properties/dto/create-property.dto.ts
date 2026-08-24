import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';
import { PropertyCategory } from '@prisma/client';

export class CreatePropertyDto {
  @ApiProperty({ example: 'Westlands Heights' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'Luxury living above the Nairobi skyline' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tagline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: PropertyCategory })
  @IsEnum(PropertyCategory)
  category: PropertyCategory;

  @ApiPropertyOptional({ example: 'Westlands' })
  @IsOptional()
  @IsString()
  neighborhood?: string;

  @ApiPropertyOptional({ example: 'Nairobi' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Nairobi County' })
  @IsOptional()
  @IsString()
  county?: string;

  @ApiPropertyOptional({ example: '-1.2684' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: '36.8035' })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'heroImageUrl must be a valid URL' })
  heroImageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'heroVideoUrl must be a valid URL' })
  heroVideoUrl?: string;

  @ApiPropertyOptional({ example: 8500000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceFrom?: number;

  @ApiPropertyOptional({
    example: 'KES',
    description: 'Currency this development is priced in. Independent of the '
      + 'platform billing currency — a listing may be priced in USD while the '
      + 'developer is still invoiced in KES.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency?: string;

  @ApiPropertyOptional({ example: 25000000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceTo?: number;

  @ApiPropertyOptional({ example: ['pool', 'gym', 'concierge'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  /**
   * On-site amenities — what the development itself has. Distinct from the
   * Amenity table, which holds nearby landmarks the development does NOT own
   * (schools, hospitals, malls) and carries a distance.
   */
  @ApiPropertyOptional({
    example: ['Swimming pool', 'Gym', 'Backup generator', '24/7 guards'],
    description: 'Facilities within the development itself. Nearby landmarks '
      + 'go to /properties/:slug/amenities instead.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({
    description: "What comes with a home, as opposed to what the building has",
    example: ['fitted kitchen', 'ensuite', 'balcony'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  unitFeatures?: string[];

  @ApiPropertyOptional({ description: 'Null means not stated, not "no pets"' })
  @IsOptional()
  @IsBoolean()
  petsAllowed?: boolean;

  @ApiPropertyOptional({ example: 'Cats and small dogs. KES 3,000/month per pet.' })
  @IsOptional()
  @IsString()
  @MaxLength(600)
  petPolicy?: string;

  @ApiPropertyOptional({ example: 'Minimum 12 months. Two months deposit.' })
  @IsOptional()
  @IsString()
  @MaxLength(600)
  leaseTerms?: string;

  @ApiPropertyOptional({ description: 'The neighbourhood in the developer\'s own words' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  areaDescription?: string;

  @ApiPropertyOptional({ example: '2026-12-01T00:00:00.000Z' })
  @IsOptional()
  completionDate?: string;

  @ApiPropertyOptional({
    description: 'Full development-creation wizard payload (details, media uploads, selected production services) kept for admin review',
  })
  @IsOptional()
  @IsObject()
  submissionData?: Record<string, unknown>;
}
