import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';

export class CreateFloorPlanDto {
  @ApiProperty({ example: '2-Bedroom Type A' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiProperty({ example: 'https://cdn.e-resi.co.ke/floorplans/2br-a.png' })
  @IsUrl({ require_tld: false })
  imageUrl: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  bathrooms?: number;

  @ApiPropertyOptional({ example: 95.5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  sqm?: number;

  @ApiPropertyOptional({ example: 1028 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  sqft?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
