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
exports.RentListingsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_js_1 = require("../common/decorators/current-user.decorator.js");
const public_decorator_js_1 = require("../common/decorators/public.decorator.js");
const roles_decorator_js_1 = require("../common/decorators/roles.decorator.js");
const pagination_dto_js_1 = require("../common/dto/pagination.dto.js");
const create_rent_listing_dto_js_1 = require("./dto/create-rent-listing.dto.js");
const create_rent_unit_dto_js_1 = require("./dto/create-rent-unit.dto.js");
const update_rent_listing_dto_js_1 = require("./dto/update-rent-listing.dto.js");
const rent_listings_service_js_1 = require("./rent-listings.service.js");
let RentListingsController = class RentListingsController {
    service;
    constructor(service) {
        this.service = service;
    }
    findAll(pagination, city, q) {
        return this.service.findAll(pagination, city, q);
    }
    findBySlug(slug) {
        return this.service.findBySlug(slug);
    }
    create(user, dto) {
        return this.service.create(user.id, dto);
    }
    findMyListings(user, pagination) {
        return this.service.findMyListings(user.id, pagination);
    }
    update(id, user, dto) {
        return this.service.update(id, user.id, user.role, dto);
    }
    setStatus(id, user, status) {
        return this.service.setStatus(id, user.id, user.role, status);
    }
    addRentUnit(id, user, dto) {
        return this.service.addRentUnit(id, user.id, user.role, dto);
    }
    removeRentUnit(unitId, user) {
        return this.service.removeRentUnit(unitId, user.id, user.role);
    }
};
exports.RentListingsController = RentListingsController;
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Public: browse rent listings' }),
    (0, swagger_1.ApiQuery)({ name: 'city', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'q', required: false }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)('city')),
    __param(2, (0, common_1.Query)('q')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pagination_dto_js_1.PaginationDto, String, String]),
    __metadata("design:returntype", void 0)
], RentListingsController.prototype, "findAll", null);
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Get)(':slug'),
    (0, swagger_1.ApiOperation)({ summary: 'Public: get rent listing by slug' }),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RentListingsController.prototype, "findBySlug", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: create rent listing' }),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_rent_listing_dto_js_1.CreateRentListingDto]),
    __metadata("design:returntype", void 0)
], RentListingsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('my/listings'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: list own rent listings' }),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, pagination_dto_js_1.PaginationDto]),
    __metadata("design:returntype", void 0)
], RentListingsController.prototype, "findMyListings", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer/Admin: update rent listing' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, update_rent_listing_dto_js_1.UpdateRentListingDto]),
    __metadata("design:returntype", void 0)
], RentListingsController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer/Admin: change rent listing status' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, common_1.Body)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], RentListingsController.prototype, "setStatus", null);
__decorate([
    (0, common_1.Post)(':id/units'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: add unit type to rent listing' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, create_rent_unit_dto_js_1.CreateRentUnitDto]),
    __metadata("design:returntype", void 0)
], RentListingsController.prototype, "addRentUnit", null);
__decorate([
    (0, common_1.Delete)(':id/units/:unitId'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: remove unit type from rent listing' }),
    __param(0, (0, common_1.Param)('unitId')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], RentListingsController.prototype, "removeRentUnit", null);
exports.RentListingsController = RentListingsController = __decorate([
    (0, swagger_1.ApiTags)('Rent Listings'),
    (0, common_1.Controller)('rent-listings'),
    __metadata("design:paramtypes", [rent_listings_service_js_1.RentListingsService])
], RentListingsController);
//# sourceMappingURL=rent-listings.controller.js.map