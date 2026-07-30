import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { AmenityType } from '@prisma/client';

export class CreateAmenityDto {
  @ApiProperty({ example: 'Westgate Shopping Mall' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: AmenityType })
  @IsEnum(AmenityType)
  type: AmenityType;

  @ApiPropertyOptional({ example: '1.2 km' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  distance?: string;

  @ApiPropertyOptional({ example: -1.2676 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 36.8064 })
  @IsOptional()
  @IsNumber()
  longitude?: number;
}
