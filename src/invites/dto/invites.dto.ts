import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AgentKind, AgentSpecialty, PartnerInviteKind, PartnerInviteStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

export class CreateInviteDto {
  @ApiProperty({ enum: PartnerInviteKind })
  @IsEnum(PartnerInviteKind)
  kind: PartnerInviteKind;

  @ApiProperty({ example: 'Bora Property Agents' })
  @IsString() @MinLength(2) @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'Asha Mwangi' })
  @IsOptional() @IsString() @MaxLength(80)
  contactName?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ description: 'Logo or picture URL (upload via /media first)' })
  @IsOptional() @IsString() @MaxLength(1000)
  logoUrl?: string;

  @ApiProperty({ description: 'The personal note shown on their welcome page' })
  @IsString() @MinLength(10) @MaxLength(1500)
  message: string;

  @ApiPropertyOptional({ enum: AgentKind, description: 'Agents only' })
  @IsOptional() @IsEnum(AgentKind)
  agentKind?: AgentKind;

  @ApiProperty({ example: 'David', description: 'Team member sharing the link' })
  @IsString() @MinLength(2) @MaxLength(60)
  referrer: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;
}

export class UpdateInviteDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  name?: string;

  @IsOptional() @IsString() @MaxLength(80)
  contactName?: string | null;

  @IsOptional() @IsEmail()
  email?: string | null;

  @IsOptional() @IsString() @MaxLength(30)
  phone?: string | null;

  @IsOptional() @IsString() @MaxLength(1000)
  logoUrl?: string | null;

  @IsOptional() @IsString() @MinLength(10) @MaxLength(1500)
  message?: string;

  @IsOptional() @IsEnum(AgentKind)
  agentKind?: AgentKind | null;

  @IsOptional() @IsString() @MinLength(2) @MaxLength(60)
  referrer?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string | null;

  @IsOptional() @IsEnum(PartnerInviteStatus)
  status?: PartnerInviteStatus;
}

export class ListInvitesDto extends PaginationDto {
  @IsOptional() @IsEnum(PartnerInviteKind)
  kind?: PartnerInviteKind;

  @IsOptional() @IsString() @MaxLength(60)
  referrer?: string;

  @ApiPropertyOptional({ enum: ['all', 'pending', 'opened', 'signed_up', 'revoked'] })
  @IsOptional() @IsIn(['all', 'pending', 'opened', 'signed_up', 'revoked'])
  state?: 'all' | 'pending' | 'opened' | 'signed_up' | 'revoked';

  @IsOptional() @IsString() @MaxLength(100)
  q?: string;
}

/** What the invitee fills in on the welcome page. */
export class AcceptInviteDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(50)
  firstName: string;

  @ApiProperty() @IsString() @MinLength(2) @MaxLength(50)
  lastName: string;

  @ApiProperty() @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 }) @IsString() @MinLength(8) @MaxLength(72)
  password: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Invalid phone number format' })
  phone?: string;

  /** Agency / company / trading name — prefilled from the invite, editable. */
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: AgentKind })
  @IsOptional() @IsEnum(AgentKind)
  agentKind?: AgentKind;

  @ApiPropertyOptional({ enum: AgentSpecialty, isArray: true })
  @IsOptional() @IsArray() @IsEnum(AgentSpecialty, { each: true })
  @Type(() => String)
  specialties?: AgentSpecialty[];
}
