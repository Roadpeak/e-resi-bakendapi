import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateConstructionUpdateDto {
  @ApiProperty({ example: 'Foundation Work Complete' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @ApiPropertyOptional({ example: 'The foundation slab has been poured and cured successfully.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 35, description: 'Overall project completion percentage (0–100)' })
  @IsInt()
  @Min(0)
  @Max(100)
  percentComplete: number;

  @ApiPropertyOptional({
    example: ['https://cdn.e-resi.co.ke/updates/foundation-1.jpg'],
    description: 'Array of image URLs for this update',
  })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  images?: string[];

  @ApiPropertyOptional({ example: '2026-07-01', description: 'Date of the update (defaults to now)' })
  @IsOptional()
  @IsDateString()
  date?: string;
}
