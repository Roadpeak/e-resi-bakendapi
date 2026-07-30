import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
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
  @IsUrl()
  heroImageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  heroVideoUrl?: string;

  @ApiPropertyOptional({ example: 8500000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceFrom?: number;

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
}
