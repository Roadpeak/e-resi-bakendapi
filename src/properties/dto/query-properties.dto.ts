import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsEnum, IsIn, IsNumberString, IsOptional, IsString } from 'class-validator';
import { PropertyCategory, PropertyStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

export class QueryPropertiesDto extends PaginationDto {
  @ApiPropertyOptional({ enum: PropertyStatus })
  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

  @ApiPropertyOptional({ enum: PropertyCategory })
  @IsOptional()
  @IsEnum(PropertyCategory)
  category?: PropertyCategory;

  @ApiPropertyOptional({ example: 'Nairobi' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Westlands' })
  @IsOptional()
  @IsString()
  neighborhood?: string;

  @ApiPropertyOptional({ description: 'Search name, tagline, description' })
  @IsOptional()
  @IsString()
  q?: string;

  /** Alias for `q` — the marketplace UI sends `search`. */
  @ApiPropertyOptional({ description: 'Alias for q' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: '5000000' })
  @IsOptional()
  @IsNumberString()
  priceMin?: string;

  @ApiPropertyOptional({ example: '25000000' })
  @IsOptional()
  @IsNumberString()
  priceMax?: string;

  @ApiPropertyOptional({ example: '3' })
  @IsOptional()
  @IsNumberString()
  bedrooms?: string;

  @ApiPropertyOptional({ example: 'true' })
  @IsOptional()
  @IsBooleanString()
  has3DTour?: string;

  @ApiPropertyOptional({ example: 'true' })
  @IsOptional()
  @IsBooleanString()
  hasVRTour?: string;

  @ApiPropertyOptional({ enum: ['featured', 'newest', 'price_asc', 'price_desc'] })
  @IsOptional()
  @IsIn(['featured', 'newest', 'price_asc', 'price_desc'])
  sortBy?: string;
}
