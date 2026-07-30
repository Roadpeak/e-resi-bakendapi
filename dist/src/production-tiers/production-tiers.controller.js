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
exports.ProductionTiersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_js_1 = require("../common/decorators/current-user.decorator.js");
const public_decorator_js_1 = require("../common/decorators/public.decorator.js");
const roles_decorator_js_1 = require("../common/decorators/roles.decorator.js");
const set_tier_dto_js_1 = require("./dto/set-tier.dto.js");
const production_tiers_service_js_1 = require("./production-tiers.service.js");
let ProductionTiersController = class ProductionTiersController {
    service;
    constructor(service) {
        this.service = service;
    }
    getPricing() {
        return this.service.getPricing();
    }
    getForProperty(slug) {
        return this.service.getForProperty(slug);
    }
    setTier(dto, user) {
        return this.service.setTier(dto, user.id, user.role);
    }
    developerTiers(user) {
        return this.service.developerTiers(user.id);
    }
    adminListAll() {
        return this.service.adminListAll();
    }
};
exports.ProductionTiersController = ProductionTiersController;
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Get)('pricing'),
    (0, swagger_1.ApiOperation)({ summary: 'Public: get tier pricing and features' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ProductionTiersController.prototype, "getPricing", null);
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Get)('properties/:slug'),
    (0, swagger_1.ApiOperation)({ summary: 'Public: get production tier for a property' }),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ProductionTiersController.prototype, "getForProperty", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer/Admin: set or upgrade production tier for a property' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [set_tier_dto_js_1.SetProductionTierDto, Object]),
    __metadata("design:returntype", void 0)
], ProductionTiersController.prototype, "setTier", null);
__decorate([
    (0, common_1.Get)('my'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: list own properties and their tiers' }),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ProductionTiersController.prototype, "developerTiers", null);
__decorate([
    (0, common_1.Get)('admin/all'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Admin: list all production tiers' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ProductionTiersController.prototype, "adminListAll", null);
exports.ProductionTiersController = ProductionTiersController = __decorate([
    (0, swagger_1.ApiTags)('Production Tiers'),
    (0, common_1.Controller)('production-tiers'),
    __metadata("design:paramtypes", [production_tiers_service_js_1.ProductionTiersService])
], ProductionTiersController);
//# sourceMappingURL=production-tiers.controller.js.map