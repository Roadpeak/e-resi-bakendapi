import { CreateRentListingDto } from './create-rent-listing.dto.js';
declare const UpdateRentListingDto_base: import("@nestjs/common").Type<Partial<Omit<CreateRentListingDto, "propertySlug">>>;
export declare class UpdateRentListingDto extends UpdateRentListingDto_base {
}
export {};
