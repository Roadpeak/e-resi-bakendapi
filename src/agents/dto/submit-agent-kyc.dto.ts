import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Document kinds the review queue understands. Companies prove the entity
 * exists and where it trades from; individuals prove identity and that they
 * are licensed to act as an agent.
 */
export const AGENT_DOCUMENT_TYPES = [
  'COMPANY_REGISTRATION',
  'TAX_CERTIFICATE',
  'ADDRESS_PROOF',
  'NATIONAL_ID',
  'AGENT_LICENCE',
  'OTHER',
] as const;

export class AgentDocumentDto {
  @ApiProperty({ enum: AGENT_DOCUMENT_TYPES })
  @IsIn(AGENT_DOCUMENT_TYPES as unknown as string[])
  type: (typeof AGENT_DOCUMENT_TYPES)[number];

  @ApiProperty({ example: 'https://res.cloudinary.com/…/cr12.pdf' })
  @IsUrl()
  url: string;

  @ApiPropertyOptional({ example: 'Certificate of Incorporation' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class SubmitAgentKycDto {
  @ApiProperty({ type: [AgentDocumentDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AgentDocumentDto)
  documents: AgentDocumentDto[];

  @ApiPropertyOptional({
    example: 'PVT-ABC123',
    description: 'Required for company agents.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  registrationNumber?: string;

  @ApiPropertyOptional({
    example: 'Kilimani Business Centre, 3rd Floor, Nairobi',
    description: 'Required for company agents — the physical trading address.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  officeAddress?: string;

  @ApiPropertyOptional({
    description: 'Passport-style photo. Required for individual agents.',
  })
  @IsOptional()
  @IsUrl()
  photoUrl?: string;
}
