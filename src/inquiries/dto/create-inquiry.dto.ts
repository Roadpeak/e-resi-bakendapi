import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateInquiryDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+254712345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'I am interested in the 2-bedroom units. What is the payment plan?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({ description: 'Property slug (for sale listing inquiry)' })
  @IsOptional()
  @IsString()
  propertySlug?: string;

  @ApiPropertyOptional({ description: 'Rent listing ID (for rental inquiry)' })
  @IsOptional()
  @IsString()
  rentListingId?: string;

  @ApiPropertyOptional({ example: 'Unit 3A' })
  @IsOptional()
  @IsString()
  interestedUnit?: string;
}
