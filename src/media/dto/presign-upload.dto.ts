import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'application/pdf',
];

export class PresignUploadDto {
  @ApiProperty({ example: 'hero.jpg' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsIn(ALLOWED_MIME_TYPES, { message: `mimeType must be one of: ${ALLOWED_MIME_TYPES.join(', ')}` })
  mimeType: string;

  @ApiPropertyOptional({ example: 'properties', default: 'properties' })
  @IsOptional()
  @IsIn(['properties', 'rentals', 'avatars', 'logos', 'documents', 'tours'])
  folder?: string;
}
