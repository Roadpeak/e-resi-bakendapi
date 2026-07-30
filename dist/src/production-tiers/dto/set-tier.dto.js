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
exports.SetProductionTierDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
class SetProductionTierDto {
    propertySlug;
    tier;
    paidAmount;
    expiresAt;
}
exports.SetProductionTierDto = SetProductionTierDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Property slug' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], SetProductionTierDto.prototype, "propertySlug", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.ProductionTierType }),
    (0, class_validator_1.IsEnum)(client_1.ProductionTierType),
    __metadata("design:type", String)
], SetProductionTierDto.prototype, "tier", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 150000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], SetProductionTierDto.prototype, "paidAmount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2027-01-01T00:00:00.000Z' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], SetProductionTierDto.prototype, "expiresAt", void 0);
//# sourceMappingURL=set-tier.dto.js.map