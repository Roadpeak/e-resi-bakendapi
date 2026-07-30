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
exports.MediaController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_js_1 = require("../common/decorators/current-user.decorator.js");
const public_decorator_js_1 = require("../common/decorators/public.decorator.js");
const roles_decorator_js_1 = require("../common/decorators/roles.decorator.js");
const add_media_dto_js_1 = require("./dto/add-media.dto.js");
const presign_upload_dto_js_1 = require("./dto/presign-upload.dto.js");
const media_service_js_1 = require("./media.service.js");
let MediaController = class MediaController {
    service;
    constructor(service) {
        this.service = service;
    }
    getPresignedUrl(dto) {
        return this.service.getPresignedUrl(dto);
    }
    upload(file, folder) {
        return this.service.uploadFile((folder ?? 'properties'), file);
    }
    listForProperty(slug, type) {
        return this.service.listForProperty(slug, type);
    }
    addToProperty(slug, user, dto) {
        return this.service.addToProperty(slug, user.id, user.role, dto);
    }
    reorder(slug, user, orderedIds) {
        return this.service.reorder(slug, user.id, user.role, orderedIds);
    }
    addToRentListing(id, user, dto) {
        return this.service.addToRentListing(id, user.id, user.role, dto);
    }
    remove(id, user) {
        return this.service.remove(id, user.id, user.role);
    }
};
exports.MediaController = MediaController;
__decorate([
    (0, common_1.Post)('presign'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Get a presigned S3 upload URL' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [presign_upload_dto_js_1.PresignUploadDto]),
    __metadata("design:returntype", void 0)
], MediaController.prototype, "getPresignedUrl", null);
__decorate([
    (0, common_1.Post)('upload'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { limits: { fileSize: 50 * 1024 * 1024 } })),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, folder: { type: 'string' } } } }),
    (0, swagger_1.ApiOperation)({ summary: 'Upload a file directly to S3 (max 50MB)' }),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)('folder')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MediaController.prototype, "upload", null);
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Get)('properties/:slug'),
    (0, swagger_1.ApiOperation)({ summary: 'Public: list all media for a property' }),
    (0, swagger_1.ApiQuery)({ name: 'type', enum: client_1.MediaType, required: false }),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, common_1.Query)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], MediaController.prototype, "listForProperty", null);
__decorate([
    (0, common_1.Post)('properties/:slug'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: attach a media record to a property' }),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, add_media_dto_js_1.AddMediaDto]),
    __metadata("design:returntype", void 0)
], MediaController.prototype, "addToProperty", null);
__decorate([
    (0, common_1.Patch)('properties/:slug/reorder'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: reorder media assets for a property' }),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, common_1.Body)('orderedIds')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Array]),
    __metadata("design:returntype", void 0)
], MediaController.prototype, "reorder", null);
__decorate([
    (0, common_1.Post)('rent-listings/:id'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: attach a media record to a rent listing' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, add_media_dto_js_1.AddMediaDto]),
    __metadata("design:returntype", void 0)
], MediaController.prototype, "addToRentListing", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: delete a media asset' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], MediaController.prototype, "remove", null);
exports.MediaController = MediaController = __decorate([
    (0, swagger_1.ApiTags)('Media'),
    (0, common_1.Controller)('media'),
    __metadata("design:paramtypes", [media_service_js_1.MediaService])
], MediaController);
//# sourceMappingURL=media.controller.js.map