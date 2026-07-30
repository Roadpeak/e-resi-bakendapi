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
exports.CreateCinematicSceneDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
class CreateCinematicSceneDto {
    label;
    sublabel;
    category;
    videoUrl;
    thumbnailUrl;
    order;
}
exports.CreateCinematicSceneDto = CreateCinematicSceneDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Aerial Approach' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], CreateCinematicSceneDto.prototype, "label", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Drone flyover at sunset' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateCinematicSceneDto.prototype, "sublabel", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.CinematicSceneCategory }),
    (0, class_validator_1.IsEnum)(client_1.CinematicSceneCategory),
    __metadata("design:type", String)
], CreateCinematicSceneDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'https://cdn.e-resi.co.ke/tours/aerial.mp4' }),
    (0, class_validator_1.IsUrl)(),
    __metadata("design:type", String)
], CreateCinematicSceneDto.prototype, "videoUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)(),
    __metadata("design:type", String)
], CreateCinematicSceneDto.prototype, "thumbnailUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 0 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateCinematicSceneDto.prototype, "order", void 0);
//# sourceMappingURL=create-cinematic-scene.dto.js.map