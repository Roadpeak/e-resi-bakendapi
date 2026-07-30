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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_js_1 = require("../common/decorators/current-user.decorator.js");
const roles_decorator_js_1 = require("../common/decorators/roles.decorator.js");
const pagination_dto_js_1 = require("../common/dto/pagination.dto.js");
const create_document_dto_js_1 = require("./dto/create-document.dto.js");
const documents_service_js_1 = require("./documents.service.js");
let DocumentsController = class DocumentsController {
    service;
    constructor(service) {
        this.service = service;
    }
    create(user, dto) {
        return this.service.create(user.id, dto);
    }
    findAll(pagination) {
        return this.service.findAll(pagination);
    }
    findMine(user, pagination) {
        return this.service.findMine(user.id, pagination);
    }
    findForReservation(reservationId, user) {
        return this.service.findForReservation(reservationId, user.id, user.role);
    }
    remove(id, user) {
        return this.service.remove(id, user.id, user.role);
    }
};
exports.DocumentsController = DocumentsController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Upload a document record (after uploading file to S3)' }),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_document_dto_js_1.CreateDocumentDto]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Admin: list all documents' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pagination_dto_js_1.PaginationDto]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('mine'),
    (0, swagger_1.ApiOperation)({ summary: 'User: list own documents' }),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, pagination_dto_js_1.PaginationDto]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "findMine", null);
__decorate([
    (0, common_1.Get)('reservations/:reservationId'),
    (0, swagger_1.ApiOperation)({ summary: 'List documents for a reservation (owner, developer, or admin)' }),
    __param(0, (0, common_1.Param)('reservationId')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "findForReservation", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a document' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "remove", null);
exports.DocumentsController = DocumentsController = __decorate([
    (0, swagger_1.ApiTags)('Documents'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('documents'),
    __metadata("design:paramtypes", [documents_service_js_1.DocumentsService])
], DocumentsController);
//# sourceMappingURL=documents.controller.js.map