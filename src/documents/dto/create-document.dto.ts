import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateDocumentDto {
  @ApiProperty({ example: 'Sale and Purchase Agreement' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({ example: 'https://cdn.e-resi.co.ke/docs/spa-cmr7abc.pdf' })
  @IsUrl()
  url: string;

  @ApiProperty({ example: 'application/pdf', description: 'MIME type of the document' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiPropertyOptional({ example: 204800, description: 'File size in bytes' })
  @IsOptional()
  @IsInt()
  sizeBytes?: number;

  @ApiPropertyOptional({ description: 'Reservation ID this document belongs to' })
  @IsOptional()
  @IsString()
  reservationId?: string;
}
