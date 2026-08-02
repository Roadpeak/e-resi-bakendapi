import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceCategoryType } from '@prisma/client';
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
  Min,
} from 'class-validator';

export class UpdateTierDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ example: 75000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: 'KES' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  order?: number;
}

export class CreateServiceDto {
  @ApiProperty({ example: 'drone_photo', description: 'Stable key referenced by orders' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9_]+$/, { message: 'key must be lowercase letters, numbers and underscores' })
  key: string;

  @ApiProperty({ example: 'Drone Photography' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiProperty({ enum: ServiceCategoryType })
  @IsEnum(ServiceCategoryType)
  category: ServiceCategoryType;

  @ApiProperty({ example: 400 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateServiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ enum: ServiceCategoryType })
  @IsOptional()
  @IsEnum(ServiceCategoryType)
  category?: ServiceCategoryType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  order?: number;
}

export class UpdateSettingDto {
  @ApiProperty({ example: '49' })
  @IsString()
  value: string;
}

/** Switch the platform billing currency, optionally converting prices. */
export class SetCurrencyDto {
  @ApiProperty({ example: 'KES', description: '3-letter ISO code' })
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency: string;

  @ApiPropertyOptional({
    example: 129.37,
    description: 'Multiplier applied to every catalog price. Omit when useLiveRate '
      + 'is true; pass 1 to relabel without converting.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  rate?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Fetch the current rate at the moment of conversion instead of '
      + 'trusting a number typed earlier. Overrides rate when true.',
  })
  @IsOptional()
  @IsBoolean()
  useLiveRate?: boolean;
}
