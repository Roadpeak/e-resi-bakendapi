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
exports.InquiriesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_js_1 = require("../common/decorators/current-user.decorator.js");
const public_decorator_js_1 = require("../common/decorators/public.decorator.js");
const roles_decorator_js_1 = require("../common/decorators/roles.decorator.js");
const pagination_dto_js_1 = require("../common/dto/pagination.dto.js");
const create_inquiry_dto_js_1 = require("./dto/create-inquiry.dto.js");
const reply_inquiry_dto_js_1 = require("./dto/reply-inquiry.dto.js");
const inquiries_service_js_1 = require("./inquiries.service.js");
let InquiriesController = class InquiriesController {
    service;
    constructor(service) {
        this.service = service;
    }
    create(dto, userId) {
        return this.service.create(dto, userId);
    }
    findAll(pagination, status) {
        return this.service.findAll(pagination, status);
    }
    findMine(user, pagination) {
        return this.service.findMine(user.id, pagination);
    }
    findForDeveloper(user, pagination, status) {
        return this.service.findForDeveloper(user.id, pagination, status);
    }
    findOne(id, user) {
        return this.service.findOne(id, user.id, user.role);
    }
    reply(id, user, dto) {
        return this.service.reply(id, user.id, user.role, dto);
    }
    updateStatus(id, user, status) {
        return this.service.updateStatus(id, user.id, user.role, status);
    }
};
exports.InquiriesController = InquiriesController;
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Submit an inquiry (public or authenticated)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Query)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_inquiry_dto_js_1.CreateInquiryDto, String]),
    __metadata("design:returntype", void 0)
], InquiriesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Admin: list all inquiries' }),
    (0, swagger_1.ApiQuery)({ name: 'status', enum: client_1.InquiryStatus, required: false }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pagination_dto_js_1.PaginationDto, String]),
    __metadata("design:returntype", void 0)
], InquiriesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('mine'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Authenticated user: list own inquiries' }),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, pagination_dto_js_1.PaginationDto]),
    __metadata("design:returntype", void 0)
], InquiriesController.prototype, "findMine", null);
__decorate([
    (0, common_1.Get)('developer'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: list inquiries on own properties/listings' }),
    (0, swagger_1.ApiQuery)({ name: 'status', enum: client_1.InquiryStatus, required: false }),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, pagination_dto_js_1.PaginationDto, String]),
    __metadata("design:returntype", void 0)
], InquiriesController.prototype, "findForDeveloper", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get inquiry detail (owner or developer of the property)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], InquiriesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(':id/reply'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Reply to an inquiry' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, reply_inquiry_dto_js_1.ReplyInquiryDto]),
    __metadata("design:returntype", void 0)
], InquiriesController.prototype, "reply", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Update inquiry status (developer or admin)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, common_1.Body)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], InquiriesController.prototype, "updateStatus", null);
exports.InquiriesController = InquiriesController = __decorate([
    (0, swagger_1.ApiTags)('Inquiries'),
    (0, common_1.Controller)('inquiries'),
    __metadata("design:paramtypes", [inquiries_service_js_1.InquiriesService])
], InquiriesController);
//# sourceMappingURL=inquiries.controller.js.map