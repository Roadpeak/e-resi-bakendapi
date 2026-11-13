import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateRentUnitDto } from './create-rent-unit.dto.js';

/** Everything about a unit type can change after listing except which physical unit it points at. */
export class UpdateRentUnitDto extends PartialType(OmitType(CreateRentUnitDto, ['unitId'] as const)) {}
