import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmptyObject, IsObject, IsOptional } from 'class-validator';

/**
 * Developer onboarding wizard payload. The wizard is a rich multi-step form
 * whose shape evolves on the frontend, so sections are validated as objects
 * and stored as JSON; company fields we understand are also promoted onto
 * the DeveloperProfile columns.
 */
export class SubmitOnboardingDto {
  @ApiProperty({ description: 'Company information section' })
  @IsObject()
  @IsNotEmptyObject()
  company: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Verification document file names (KYB)' })
  @IsOptional()
  @IsObject()
  verificationDocs?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Legacy development section — developments are now submitted separately via POST /properties',
  })
  @IsOptional()
  @IsObject()
  development?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Media production & services selection' })
  @IsOptional()
  @IsObject()
  media?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Listing & lead preferences' })
  @IsOptional()
  @IsObject()
  preferences?: Record<string, unknown>;
}
