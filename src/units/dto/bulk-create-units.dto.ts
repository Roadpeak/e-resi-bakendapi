import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateUnitDto } from './create-unit.dto.js';

/** A spreadsheet's worth of units, imported in one request. */
export class BulkCreateUnitsDto {
  @ApiProperty({ type: [CreateUnitDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateUnitDto)
  units: CreateUnitDto[];
}
