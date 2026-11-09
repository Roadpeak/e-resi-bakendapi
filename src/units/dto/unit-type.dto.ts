import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl, Matches, MaxLength, Min,
} from 'class-validator';

export class UnitTypeDto {
  @ApiProperty({ example: '3 Bedroom · 200 sqft' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  bathrooms?: number;

  @ApiPropertyOptional({ example: 145 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sqm?: number;

  @ApiPropertyOptional({ example: 1560 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sqft?: number;

  @ApiPropertyOptional({ example: 21000000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceFrom?: number;

  @ApiPropertyOptional({ example: 23500000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceTo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  features?: string[];

  /** Blank clears it; anything else is a stored upload URL. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Matches(/^(https?:\/\/\S+)?$/, { message: 'floorPlanUrl must be a link' })
  floorPlanUrl?: string;

  /** Blank clears it; anything else is a stored upload URL. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Matches(/^(https?:\/\/\S+)?$/, { message: 'coverImageUrl must be a link' })
  coverImageUrl?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  availableCount?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  reservedCount?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  soldCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  cinematicSceneIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  tourSection3DIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  vrSceneIds?: string[];

  /** Individual units of this layout. Linking any switches counts to them. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @IsString({ each: true })
  unitIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  order?: number;
}

export class UpdateUnitTypeDto implements Partial<UnitTypeDto> {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsInt() @Min(0) bedrooms?: number;
  @IsOptional() @IsInt() @Min(0) bathrooms?: number;
  @IsOptional() @IsNumber() @Min(0) sqm?: number;
  @IsOptional() @IsNumber() @Min(0) sqft?: number;
  @IsOptional() @IsNumber() @Min(0) priceFrom?: number;
  @IsOptional() @IsNumber() @Min(0) priceTo?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(40) @IsString({ each: true }) features?: string[];
  @IsOptional() @IsString() @MaxLength(1000) floorPlanUrl?: string;
  @IsOptional() @IsString() @MaxLength(1000) coverImageUrl?: string;
  @IsOptional() @IsInt() @Min(0) availableCount?: number;
  @IsOptional() @IsInt() @Min(0) reservedCount?: number;
  @IsOptional() @IsInt() @Min(0) soldCount?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(60) @IsString({ each: true }) cinematicSceneIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(60) @IsString({ each: true }) tourSection3DIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(60) @IsString({ each: true }) vrSceneIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(2000) @IsString({ each: true }) unitIds?: string[];
  @IsOptional() @IsInt() order?: number;
}

/** One step on the inventory: e.g. one available unit becomes sold. */
export class MoveInventoryDto {
  @IsIn(['available', 'reserved', 'sold'])
  from: 'available' | 'reserved' | 'sold';

  @IsIn(['available', 'reserved', 'sold'])
  to: 'available' | 'reserved' | 'sold';

  @IsOptional()
  @IsInt()
  @Min(1)
  count?: number;
}

export class UnitTypeMediaDto {
  @IsIn(['PHOTO', 'VIDEO'])
  type: 'PHOTO' | 'VIDEO';

  @IsUrl()
  url: string;

  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsInt() sizeBytes?: number;
  @IsOptional() @IsString() @MaxLength(100) mimeType?: string;
}
