import { PartialType } from '@nestjs/swagger';
import { CreateConstructionUpdateDto } from './create-construction-update.dto.js';

export class UpdateConstructionUpdateDto extends PartialType(CreateConstructionUpdateDto) {}
