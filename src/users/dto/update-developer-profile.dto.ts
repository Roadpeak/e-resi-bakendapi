import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';

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
}
