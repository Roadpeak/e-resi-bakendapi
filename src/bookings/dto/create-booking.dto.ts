import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { BookingType } from '@prisma/client';

export class CreateBookingDto {
  @ApiProperty({ description: 'Property slug to book a viewing for' })
  @IsString()
  @IsNotEmpty()
  propertySlug: string;

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

  @ApiProperty({ example: '2026-08-15', description: 'Preferred viewing date (ISO date)' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: '10:00', description: 'Preferred viewing time (HH:MM)' })
  @IsString()
  @IsNotEmpty()
  time: string;

  @ApiProperty({ enum: BookingType, default: 'PHYSICAL' })
  @IsEnum(BookingType)
  type: BookingType;

  @ApiPropertyOptional({ example: 'Please show us the penthouse units.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
