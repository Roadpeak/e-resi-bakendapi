import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
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

  @ApiPropertyOptional({ example: 10, description: 'Floor this unit sits on' })
  @IsOptional()
  @IsInt()
  floor?: number;

  @ApiPropertyOptional({ description: 'Physical unit this offer refers to' })
  @IsOptional()
  @IsString()
  unitId?: string;

  @ApiPropertyOptional({ example: '2 Bedroom', description: 'Layout being let' })
  @IsOptional()
  @IsString()
  unitType?: string;

  @ApiPropertyOptional({ description: 'Show the property cinematic tour for this unit type' })
  @IsOptional()
  @IsBoolean()
  showCinematicTour?: boolean;

  @ApiPropertyOptional({ description: 'Show the property 3D tour for this unit type' })
  @IsOptional()
  @IsBoolean()
  show3DTour?: boolean;

  @ApiPropertyOptional({ description: 'Show the property VR tour for this unit type' })
  @IsOptional()
  @IsBoolean()
  showVRTour?: boolean;

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
