import { PartialType } from '@nestjs/swagger';
import { CreateLeadDto } from './create-lead.dto.js';

export class UpdateLeadDto extends PartialType(CreateLeadDto) {}
