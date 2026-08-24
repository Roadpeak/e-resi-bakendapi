import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
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

  @ApiPropertyOptional({
    example: 'USD',
    description:
      'Currency for this unit\'s price. Defaults to the property\'s currency '
      + 'when omitted — a development priced in USD should not have to repeat '
      + 'itself on every unit.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency?: string;

  @ApiPropertyOptional({ enum: UnitStatus })
  @IsOptional()
  @IsEnum(UnitStatus)
  status?: UnitStatus;

  @ApiPropertyOptional({ example: ['ensuite', 'balcony', 'DSQ'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  /**
   * The layout this unit is built to.
   *
   * Optional because the unit page falls back to the plan matching the
   * bedroom count. Naming one matters where a bedroom count has several
   * layouts, which is exactly when the fallback declines to guess.
   */
  @ApiPropertyOptional({ description: 'Floor plan this unit uses', example: 'clx123abc' })
  @IsOptional()
  @IsString()
  floorPlanId?: string;
}
