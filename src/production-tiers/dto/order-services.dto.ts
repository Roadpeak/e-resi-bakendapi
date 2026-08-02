import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, MaxLength,
  ValidateNested,
} from 'class-validator';

class OrderedServiceDto {
  @ApiProperty({ example: 'drone_photo', description: 'Catalog service key' })
  @IsString()
  serviceKey: string;

  @ApiPropertyOptional({ example: '2026-09-14', description: 'When the developer would like it done' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  preferredDate?: string;

  @ApiPropertyOptional({ example: 'Shoot the rooftop first — best light before 9am.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  instructions?: string;

  @ApiPropertyOptional({ example: 'Gate 3, ask for the site foreman.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  accessInfo?: string;
}

export class OrderServicesDto {
  @ApiProperty({ type: [OrderedServiceDto] })
  @IsArray()
  @ArrayMinSize(1)
  // A single request ordering the entire catalog many times over is far more
  // likely to be a bug than a genuine order.
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OrderedServiceDto)
  services: OrderedServiceDto[];
}
