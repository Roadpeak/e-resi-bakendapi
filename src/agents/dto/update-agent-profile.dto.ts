import { ApiPropertyOptional } from '@nestjs/swagger';
import { AgentSpecialty } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class AgentSocialsDto {
  @ApiPropertyOptional() @IsOptional() @IsUrl() instagram?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() facebook?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() twitter?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() linkedin?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() tiktok?: string;
}

export class UpdateAgentProfileDto {
  @ApiPropertyOptional({ example: 'Bora Property Agents' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(80)
  yearsExperience?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Passport-style photo — required for individuals' })
  @IsOptional()
  @IsUrl()
  photoUrl?: string;

  @ApiPropertyOptional({ enum: AgentSpecialty, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(AgentSpecialty, { each: true })
  specialties?: AgentSpecialty[];

  @ApiPropertyOptional({ example: ['Kilimani', 'Westlands'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  serviceAreas?: string[];

  @ApiPropertyOptional({ example: '+254712345678' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'phone must be digits, optionally starting with +' })
  phone?: string;

  @ApiPropertyOptional({
    example: '254712345678',
    description: 'Digits only, no plus — used to build a wa.me link directly.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{7,15}$/, { message: 'whatsapp must be digits only, no + or spaces' })
  whatsapp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({ example: 'Kilimani Business Centre, 3rd Floor, Nairobi' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  officeAddress?: string;

  @ApiPropertyOptional({ example: 'Nairobi, Kilimani' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @ApiPropertyOptional({ type: AgentSocialsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AgentSocialsDto)
  socials?: AgentSocialsDto;
}
