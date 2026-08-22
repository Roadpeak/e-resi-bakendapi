import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'application/pdf',
  // Digital twins. Browsers rarely know glTF by name — most report a .glb as
  // octet-stream — so both are accepted and the server checks the file's own
  // magic bytes rather than trusting the label.
  'model/gltf-binary', 'model/gltf+json', 'application/octet-stream',
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
