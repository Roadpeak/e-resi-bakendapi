"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateRentListingDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const create_rent_listing_dto_js_1 = require("./create-rent-listing.dto.js");
class UpdateRentListingDto extends (0, swagger_1.PartialType)((0, swagger_1.OmitType)(create_rent_listing_dto_js_1.CreateRentListingDto, ['propertySlug'])) {
}
exports.UpdateRentListingDto = UpdateRentListingDto;
//# sourceMappingURL=update-rent-listing.dto.js.map