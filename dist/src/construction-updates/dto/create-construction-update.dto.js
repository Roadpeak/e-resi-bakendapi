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
exports.CreateConstructionUpdateDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CreateConstructionUpdateDto {
    title;
    description;
    percentComplete;
    images;
    date;
}
exports.CreateConstructionUpdateDto = CreateConstructionUpdateDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Foundation Work Complete' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateConstructionUpdateDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'The foundation slab has been poured and cured successfully.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateConstructionUpdateDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 35, description: 'Overall project completion percentage (0–100)' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], CreateConstructionUpdateDto.prototype, "percentComplete", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: ['https://cdn.e-resi.co.ke/updates/foundation-1.jpg'],
        description: 'Array of image URLs for this update',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsUrl)({}, { each: true }),
    __metadata("design:type", Array)
], CreateConstructionUpdateDto.prototype, "images", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-07-01', description: 'Date of the update (defaults to now)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateConstructionUpdateDto.prototype, "date", void 0);
//# sourceMappingURL=create-construction-update.dto.js.map