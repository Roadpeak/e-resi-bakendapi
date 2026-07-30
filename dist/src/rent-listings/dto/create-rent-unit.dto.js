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
exports.CreateRentUnitDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
class CreateRentUnitDto {
    label;
    bedrooms;
    bathrooms;
    sqm;
    pricePerMonth;
    available;
    total;
    furnishing;
    features;
}
exports.CreateRentUnitDto = CreateRentUnitDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1-Bedroom Studio' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], CreateRentUnitDto.prototype, "label", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateRentUnitDto.prototype, "bedrooms", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateRentUnitDto.prototype, "bathrooms", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 52.0 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateRentUnitDto.prototype, "sqm", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 65000 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateRentUnitDto.prototype, "pricePerMonth", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 4, description: 'Number of available units of this type' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateRentUnitDto.prototype, "available", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 10, description: 'Total units of this type' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateRentUnitDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.FurnishingType }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.FurnishingType),
    __metadata("design:type", String)
], CreateRentUnitDto.prototype, "furnishing", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: ['ensuite', 'balcony'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CreateRentUnitDto.prototype, "features", void 0);
//# sourceMappingURL=create-rent-unit.dto.js.map