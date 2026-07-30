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
exports.CreatePropertyDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
class CreatePropertyDto {
    name;
    tagline;
    description;
    category;
    neighborhood;
    city;
    county;
    latitude;
    longitude;
    heroImageUrl;
    heroVideoUrl;
    priceFrom;
    priceTo;
    tags;
    completionDate;
}
exports.CreatePropertyDto = CreatePropertyDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Westlands Heights' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreatePropertyDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Luxury living above the Nairobi skyline' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreatePropertyDto.prototype, "tagline", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreatePropertyDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.PropertyCategory }),
    (0, class_validator_1.IsEnum)(client_1.PropertyCategory),
    __metadata("design:type", String)
], CreatePropertyDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Westlands' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreatePropertyDto.prototype, "neighborhood", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Nairobi' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreatePropertyDto.prototype, "city", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Nairobi County' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreatePropertyDto.prototype, "county", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '-1.2684' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreatePropertyDto.prototype, "latitude", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '36.8035' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreatePropertyDto.prototype, "longitude", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)(),
    __metadata("design:type", String)
], CreatePropertyDto.prototype, "heroImageUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)(),
    __metadata("design:type", String)
], CreatePropertyDto.prototype, "heroVideoUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 8500000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreatePropertyDto.prototype, "priceFrom", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 25000000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreatePropertyDto.prototype, "priceTo", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: ['pool', 'gym', 'concierge'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CreatePropertyDto.prototype, "tags", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-12-01T00:00:00.000Z' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreatePropertyDto.prototype, "completionDate", void 0);
//# sourceMappingURL=create-property.dto.js.map