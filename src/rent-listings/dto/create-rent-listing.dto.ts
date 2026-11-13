import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';
import { FurnishingType, PropertyCategory } from '@prisma/client';

export class CreateRentListingDto {
  @ApiProperty({ example: 'Westlands Heights — Rentals' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tagline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Property slug this rent listing belongs to. Omit for a '
      + 'standalone rental — one home listed on its own, without a development.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  propertySlug?: string;

  @ApiPropertyOptional({ enum: PropertyCategory, description: 'Kind of home (standalone rentals)' })
  @IsOptional()
  @IsEnum(PropertyCategory)
  category?: PropertyCategory;

  @ApiPropertyOptional({ description: 'Show only the area publicly; the exact spot and map stay hidden' })
  @IsOptional()
  @IsBoolean()
  hideExactLocation?: boolean;

  @ApiPropertyOptional({ example: ['Parking', 'Borehole', 'Backup generator'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({ example: -1.2635 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 36.8034 })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ example: 'Nairobi County' })
  @IsOptional()
  @IsString()
  county?: string;

  @ApiPropertyOptional({ enum: FurnishingType })
  @IsOptional()
  @IsEnum(FurnishingType)
  furnishing?: FurnishingType;

  @ApiPropertyOptional({ example: 'Westlands' })
  @IsOptional()
  @IsString()
  neighborhood?: string;

  @ApiPropertyOptional({ example: 'Nairobi' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 45000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceFrom?: number;

  @ApiPropertyOptional({
    example: 'KES',
    description: 'Currency this listing is priced in. Independent of the '
      + 'platform billing currency.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency?: string;

  @ApiPropertyOptional({ example: 120000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceTo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  heroImageUrl?: string;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z' })
  @IsOptional()
  availableFrom?: string;

  @ApiPropertyOptional({ example: 12, description: 'Minimum lease term in months' })
  @IsOptional()
  @IsInt()
  @Min(1)
  minLeaseTerm?: number;

  @ApiPropertyOptional({ example: ['pet-friendly', 'secure-parking'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
