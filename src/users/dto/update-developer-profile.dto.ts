import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail, IsInt, IsObject, IsOptional, IsString, IsUrl, Matches, MaxLength, Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Every key optional — the profile page renders only whichever are present. */
class SocialsDto {
  @ApiPropertyOptional({ example: 'https://instagram.com/acmedevelopers' })
  @IsOptional()
  @IsUrl()
  instagram?: string;

  @ApiPropertyOptional({ example: 'https://facebook.com/acmedevelopers' })
  @IsOptional()
  @IsUrl()
  facebook?: string;

  @ApiPropertyOptional({ example: 'https://twitter.com/acmedevelopers' })
  @IsOptional()
  @IsUrl()
  twitter?: string;

  @ApiPropertyOptional({ example: 'https://linkedin.com/company/acmedevelopers' })
  @IsOptional()
  @IsUrl()
  linkedin?: string;

  @ApiPropertyOptional({ example: 'https://tiktok.com/@acmedevelopers' })
  @IsOptional()
  @IsUrl()
  tiktok?: string;
}

export class UpdateDeveloperProfileDto {
  @ApiPropertyOptional({ example: 'Acme Developers Ltd' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyName?: string;

  @ApiPropertyOptional({ example: 'Leading real estate developer in Nairobi' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 2005 })
  @IsOptional()
  @IsInt()
  @Min(1900)
  establishedYear?: number;

  @ApiPropertyOptional({ example: 'https://acmedevelopers.co.ke' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ example: 'https://cdn.e-resi.co.ke/logos/acme.png' })
  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @ApiPropertyOptional({ example: '+254712345678', description: 'Public contact number shown on the developer card' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'phone must be digits, optionally starting with +' })
  phone?: string;

  @ApiPropertyOptional({
    example: 'sales@acmedevelopers.co.ke',
    description: 'Public sales address shown on the developer profile. Not the account login.',
  })
  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid address' })
  @MaxLength(120)
  email?: string;

  @ApiPropertyOptional({ example: '254712345678', description: 'wa.me-ready number: digits only, no +' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{7,15}$/, { message: 'whatsapp must be digits only, e.g. 254712345678' })
  whatsapp?: string;

  @ApiPropertyOptional({ example: 'Nairobi, Westlands' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @ApiPropertyOptional({ type: SocialsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SocialsDto)
  socials?: SocialsDto;
}
