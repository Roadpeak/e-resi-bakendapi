import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray, IsBoolean, IsDateString, IsInt, IsNotEmpty, IsNumber,
  IsOptional, IsString, MaxLength, Min,
} from 'class-validator';

export class UpsertTwinDto {
  @ApiPropertyOptional({ example: 1, description: 'Metres per model unit' })
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  scale?: number;

  @ApiPropertyOptional({ description: 'Checked on site against a known dimension' })
  @IsOptional()
  @IsBoolean()
  scaleVerified?: boolean;

  @ApiPropertyOptional({ example: ['Ground', 'First', 'Roof'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  floors?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  originX?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  originY?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  originZ?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  capturedAt?: string;
}

export class CreateWaypointDto {
  @ApiProperty({ example: 'Living & Dining' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label: string;

  @ApiPropertyOptional({ example: 'Full-height glazing onto the balcony.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  caption?: string;

  @ApiPropertyOptional({ example: 'Kitchen', description: 'Which route this stop belongs to' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  route?: string;

  @ApiProperty() @IsNumber() posX: number;
  @ApiProperty() @IsNumber() posY: number;
  @ApiProperty() @IsNumber() posZ: number;

  @ApiPropertyOptional() @IsOptional() @IsNumber() lookX?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() lookY?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() lookZ?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) floor?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) order?: number;
}

export class CreateTagDto {
  @ApiProperty({ example: 'Fitted kitchen' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  body?: string;

  @ApiProperty() @IsNumber() posX: number;
  @ApiProperty() @IsNumber() posY: number;
  @ApiProperty() @IsNumber() posZ: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) floor?: number;
}
