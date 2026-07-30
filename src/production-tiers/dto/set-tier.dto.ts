import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ProductionTierType } from '@prisma/client';

export class SetProductionTierDto {
  @ApiProperty({ description: 'Property slug' })
  @IsString()
  @IsNotEmpty()
  propertySlug: string;

  @ApiProperty({ enum: ProductionTierType })
  @IsEnum(ProductionTierType)
  tier: ProductionTierType;

  @ApiPropertyOptional({ example: 150000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  paidAmount?: number;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
