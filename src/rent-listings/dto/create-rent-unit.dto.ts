import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { FurnishingType } from '@prisma/client';

export class CreateRentUnitDto {
  @ApiProperty({ example: '1-Bedroom Studio' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  bathrooms?: number;

  @ApiPropertyOptional({ example: 52.0 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  sqm?: number;

  @ApiProperty({ example: 65000 })
  @IsNumber()
  @Min(0)
  pricePerMonth: number;

  @ApiPropertyOptional({ example: 4, description: 'Number of available units of this type' })
  @IsOptional()
  @IsInt()
  @Min(0)
  available?: number;

  @ApiPropertyOptional({ example: 10, description: 'Total units of this type' })
  @IsOptional()
  @IsInt()
  @Min(1)
  total?: number;

  @ApiPropertyOptional({ enum: FurnishingType })
  @IsOptional()
  @IsEnum(FurnishingType)
  furnishing?: FurnishingType;

  @ApiPropertyOptional({ example: ['ensuite', 'balcony'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];
}
