import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString,
  Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { PropertyCategory } from '@prisma/client';

export const REQUESTER_TYPES = ['DEVELOPER', 'AGENT', 'INVESTOR', 'BUYER', 'TENANT', 'OTHER'] as const;

export class CreateServiceRequestDto {
  @ApiProperty({ enum: REQUESTER_TYPES }) @IsIn(REQUESTER_TYPES as unknown as string[]) requesterType: string;

  @ApiProperty({ type: [String], description: 'Catalogue keys of the services wanted' })
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(60, { each: true })
  services: string[];

  @ApiPropertyOptional({ description: 'Anything not in the catalogue, in words' })
  @IsOptional() @IsString() @MaxLength(300) otherService?: string;

  @ApiPropertyOptional({ enum: PropertyCategory }) @IsOptional() @IsIn(Object.values(PropertyCategory)) propertyType?: PropertyCategory;

  @ApiProperty() @IsString() @MinLength(2) @MaxLength(160) location: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() preferredDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) timing?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) scope?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) budget?: string;
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(3000) details: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) contactPhone?: string;
}

export class ChangeRequestDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(2000) message: string;
}

export class QuoteLineDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) description: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.01) @Max(100000) quantity: number;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) @Max(1_000_000_000) unitAmount: number;
}

export class SendQuoteDto {
  @ApiProperty({ type: [QuoteLineDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => QuoteLineDto)
  lines: QuoteLineDto[];
  @ApiPropertyOptional({ description: 'Days the quote stays valid (default 14)' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(90) validDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export const ADMIN_STATUSES = ['IN_PRODUCTION', 'DELIVERED', 'DECLINED'] as const;
export class AdminStatusDto {
  @ApiProperty({ enum: ADMIN_STATUSES }) @IsIn(ADMIN_STATUSES as unknown as string[]) status: (typeof ADMIN_STATUSES)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class AdminListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
}
