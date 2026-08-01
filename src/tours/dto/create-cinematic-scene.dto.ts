import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';
import { CinematicSceneCategory } from '@prisma/client';

export class CreateCinematicSceneDto {
  @ApiProperty({ example: 'Aerial Approach' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label: string;

  @ApiPropertyOptional({ example: 'Drone flyover at sunset' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sublabel?: string;

  @ApiProperty({ enum: CinematicSceneCategory })
  @IsEnum(CinematicSceneCategory)
  category: CinematicSceneCategory;

  @ApiProperty({ example: 'https://cdn.e-resi.co.ke/tours/aerial.mp4' })
  @IsUrl({ require_tld: false })
  videoUrl: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  thumbnailUrl?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
