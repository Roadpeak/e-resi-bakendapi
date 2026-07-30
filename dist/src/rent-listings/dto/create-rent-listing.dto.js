"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateRentListingDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
class CreateRentListingDto {
    name;
    tagline;
    description;
    propertySlug;
    furnishing;
    neighborhood;
    city;
    priceFrom;
    priceTo;
    heroImageUrl;
    availableFrom;
    minLeaseTerm;
    tags;
}
exports.CreateRentListingDto = CreateRentListingDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Westlands Heights — Rentals' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateRentListingDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateRentListingDto.prototype, "tagline", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRentListingDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Property slug this rent listing belongs to' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateRentListingDto.prototype, "propertySlug", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.FurnishingType }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.FurnishingType),
    __metadata("design:type", String)
], CreateRentListingDto.prototype, "furnishing", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Westlands' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRentListingDto.prototype, "neighborhood", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Nairobi' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRentListingDto.prototype, "city", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 45000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateRentListingDto.prototype, "priceFrom", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 120000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateRentListingDto.prototype, "priceTo", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)(),
    __metadata("design:type", String)
], CreateRentListingDto.prototype, "heroImageUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-09-01T00:00:00.000Z' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateRentListingDto.prototype, "availableFrom", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 12, description: 'Minimum lease term in months' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateRentListingDto.prototype, "minLeaseTerm", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: ['pet-friendly', 'secure-parking'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CreateRentListingDto.prototype, "tags", void 0);
//# sourceMappingURL=create-rent-listing.dto.js.map