import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * What a visitor leaves to see an agent's phone number: their own name and
 * number, so the agent gets a lead instead of an anonymous view.
 */
export class RevealContactDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: '+254712345678' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phone: string;

  @ApiPropertyOptional({ example: 'jane@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'The rental the visitor was looking at' })
  @IsOptional()
  @IsString()
  rentListingId?: string;

  @ApiPropertyOptional({ description: 'The development the visitor was looking at' })
  @IsOptional()
  @IsString()
  propertySlug?: string;
}
