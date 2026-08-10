import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AgentKind, AgentSpecialty } from '@prisma/client';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Jane' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  lastName: string;

  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'P@ssword123', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ApiProperty({ enum: ['DEVELOPER', 'AGENT', 'INVESTOR', 'TENANT'] })
  @IsIn(['DEVELOPER', 'AGENT', 'INVESTOR', 'TENANT'], {
    message: 'role must be one of: DEVELOPER, AGENT, INVESTOR, TENANT',
  })
  role: 'DEVELOPER' | 'AGENT' | 'INVESTOR' | 'TENANT';

  @ApiPropertyOptional({ example: '+254712345678' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Invalid phone number format' })
  phone?: string;

  @ApiPropertyOptional({ example: 'Acme Developers Ltd' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyName?: string;

  // ─── Agent accounts ────────────────────────────────────────────────────

  @ApiPropertyOptional({
    enum: AgentKind,
    description: 'Required when role is AGENT. Decides which KYC documents '
      + 'are asked for and which listing fee applies.',
  })
  @IsOptional()
  @IsEnum(AgentKind)
  agentKind?: AgentKind;

  @ApiPropertyOptional({
    example: 'Bora Property Agents',
    description: 'Required when role is AGENT — the trading name shown in the '
      + 'directory. A company name, or an individual\'s professional name.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional({
    enum: AgentSpecialty,
    isArray: true,
    example: ['APARTMENT_RENTAL', 'VILLA_PURCHASE'],
    description: 'What the agent handles. Without at least one they cannot be '
      + 'matched to a buyer or tenant, so this is required for agents.',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(AgentSpecialty, { each: true })
  specialties?: AgentSpecialty[];
}
