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
exports.CreateDocumentDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CreateDocumentDto {
    name;
    url;
    type;
    sizeBytes;
    reservationId;
}
exports.CreateDocumentDto = CreateDocumentDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Sale and Purchase Agreement' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(150),
    __metadata("design:type", String)
], CreateDocumentDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'https://cdn.e-resi.co.ke/docs/spa-cmr7abc.pdf' }),
    (0, class_validator_1.IsUrl)(),
    __metadata("design:type", String)
], CreateDocumentDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'application/pdf', description: 'MIME type of the document' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateDocumentDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 204800, description: 'File size in bytes' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateDocumentDto.prototype, "sizeBytes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Reservation ID this document belongs to' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateDocumentDto.prototype, "reservationId", void 0);
//# sourceMappingURL=create-document.dto.js.map