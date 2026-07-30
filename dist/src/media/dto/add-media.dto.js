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
exports.AddMediaDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
class AddMediaDto {
    type;
    url;
    thumbnailUrl;
    title;
    order;
    isFeatured;
    sizeBytes;
    mimeType;
}
exports.AddMediaDto = AddMediaDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.MediaType }),
    (0, class_validator_1.IsEnum)(client_1.MediaType),
    __metadata("design:type", String)
], AddMediaDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Public URL of the uploaded file' }),
    (0, class_validator_1.IsUrl)(),
    __metadata("design:type", String)
], AddMediaDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)(),
    __metadata("design:type", String)
], AddMediaDto.prototype, "thumbnailUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Living Room — Golden Hour' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], AddMediaDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 0 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], AddMediaDto.prototype, "order", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AddMediaDto.prototype, "isFeatured", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 2048000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], AddMediaDto.prototype, "sizeBytes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'image/jpeg' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddMediaDto.prototype, "mimeType", void 0);
//# sourceMappingURL=add-media.dto.js.map