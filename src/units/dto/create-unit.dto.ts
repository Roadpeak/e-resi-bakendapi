import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { UnitStatus } from '@prisma/client';

export class CreateUnitDto {
  @ApiProperty({ example: 'Unit 3A' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  floor?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  bathrooms?: number;

  @ApiPropertyOptional({ example: 95.5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  sqm?: number;

  @ApiProperty({ example: 12500000 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ enum: UnitStatus })
  @IsOptional()
  @IsEnum(UnitStatus)
  status?: UnitStatus;

  @ApiPropertyOptional({ example: ['ensuite', 'balcony', 'DSQ'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];
}
