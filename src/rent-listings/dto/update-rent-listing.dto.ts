import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateRentListingDto } from './create-rent-listing.dto.js';

export class UpdateRentListingDto extends PartialType(
  OmitType(CreateRentListingDto, ['propertySlug'] as const),
) {}
