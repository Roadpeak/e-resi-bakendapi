import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
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
