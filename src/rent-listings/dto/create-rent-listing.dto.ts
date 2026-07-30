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
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';
import { FurnishingType } from '@prisma/client';

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

  @ApiProperty({ description: 'Property slug this rent listing belongs to' })
  @IsString()
  @IsNotEmpty()
  propertySlug: string;

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
