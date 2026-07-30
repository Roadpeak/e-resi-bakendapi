import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
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
}
