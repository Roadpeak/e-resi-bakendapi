import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';
import { MediaType } from '@prisma/client';

export class AddMediaDto {
  @ApiProperty({ enum: MediaType })
  @IsEnum(MediaType)
  type: MediaType;

  @ApiProperty({ description: 'Public URL of the uploaded file' })
  @IsUrl()
  url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  thumbnailUrl?: string;

  @ApiPropertyOptional({ example: 'Living Room — Golden Hour' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ example: 2048000 })
  @IsOptional()
  @IsInt()
  sizeBytes?: number;

  @ApiPropertyOptional({ example: 'image/jpeg' })
  @IsOptional()
  @IsString()
  mimeType?: string;
}
