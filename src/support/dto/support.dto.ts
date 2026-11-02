import { ApiPropertyOptional } from '@nestjs/swagger';
import { SupportCategory, SupportStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const blankToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const v = value.trim();
  return v === '' ? undefined : v;
};

export class CreateSupportThreadDto {
  @ApiPropertyOptional({ enum: SupportCategory })
  @IsOptional()
  @IsEnum(SupportCategory)
  category?: SupportCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(140)
  subject?: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(5000)
  message!: string;

  /** Visitors only — a signed-in user's details come from their account. */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(blankToUndefined)
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(blankToUndefined)
  @Matches(/^\+?[0-9 ()-]{7,20}$/, { message: 'Enter a valid phone number' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(500)
  pageUrl?: string;
}

export class SupportMessageDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}

export class SupportStatusDto {
  @IsEnum(SupportStatus)
  status!: SupportStatus;
}

export class AdminSupportQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(['OPEN', 'RESOLVED', 'UNREAD', 'ALL'])
  filter?: 'OPEN' | 'RESOLVED' | 'UNREAD' | 'ALL';

  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(120)
  q?: string;
}
