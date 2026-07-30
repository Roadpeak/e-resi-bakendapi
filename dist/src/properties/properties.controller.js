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
exports.PropertiesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_js_1 = require("../common/decorators/current-user.decorator.js");
const public_decorator_js_1 = require("../common/decorators/public.decorator.js");
const roles_decorator_js_1 = require("../common/decorators/roles.decorator.js");
const create_property_dto_js_1 = require("./dto/create-property.dto.js");
const query_properties_dto_js_1 = require("./dto/query-properties.dto.js");
const update_property_dto_js_1 = require("./dto/update-property.dto.js");
const properties_service_js_1 = require("./properties.service.js");
let PropertiesController = class PropertiesController {
    propertiesService;
    constructor(propertiesService) {
        this.propertiesService = propertiesService;
    }
    findAll(query) {
        return this.propertiesService.findAll(query);
    }
    findBySlug(slug) {
        return this.propertiesService.findBySlug(slug);
    }
    create(user, dto) {
        return this.propertiesService.create(user.id, dto);
    }
    findMyProperties(user, query) {
        return this.propertiesService.findMyProperties(user.id, query);
    }
    update(slug, user, dto) {
        return this.propertiesService.update(slug, user.id, user.role, dto);
    }
    setStatus(slug, user, status) {
        return this.propertiesService.setStatus(slug, user.id, user.role, status);
    }
    archive(slug, user) {
        return this.propertiesService.archive(slug, user.id, user.role);
    }
};
exports.PropertiesController = PropertiesController;
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Public: browse active properties' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_properties_dto_js_1.QueryPropertiesDto]),
    __metadata("design:returntype", void 0)
], PropertiesController.prototype, "findAll", null);
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Get)(':slug'),
    (0, swagger_1.ApiOperation)({ summary: 'Public: get property detail by slug' }),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PropertiesController.prototype, "findBySlug", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: create a new property listing' }),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_property_dto_js_1.CreatePropertyDto]),
    __metadata("design:returntype", void 0)
], PropertiesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('my/listings'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: list own properties' }),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, query_properties_dto_js_1.QueryPropertiesDto]),
    __metadata("design:returntype", void 0)
], PropertiesController.prototype, "findMyProperties", null);
__decorate([
    (0, common_1.Patch)(':slug'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer/Admin: update property' }),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, update_property_dto_js_1.UpdatePropertyDto]),
    __metadata("design:returntype", void 0)
], PropertiesController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)(':slug/status'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer/Admin: publish, archive, or change property status' }),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, common_1.Body)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], PropertiesController.prototype, "setStatus", null);
__decorate([
    (0, common_1.Delete)(':slug'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer/Admin: archive (soft delete) a property' }),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PropertiesController.prototype, "archive", null);
exports.PropertiesController = PropertiesController = __decorate([
    (0, swagger_1.ApiTags)('Properties'),
    (0, common_1.Controller)('properties'),
    __metadata("design:paramtypes", [properties_service_js_1.PropertiesService])
], PropertiesController);
//# sourceMappingURL=properties.controller.js.map