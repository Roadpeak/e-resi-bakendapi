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
exports.UnitsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_js_1 = require("../common/decorators/current-user.decorator.js");
const public_decorator_js_1 = require("../common/decorators/public.decorator.js");
const roles_decorator_js_1 = require("../common/decorators/roles.decorator.js");
const create_unit_dto_js_1 = require("./dto/create-unit.dto.js");
const update_unit_dto_js_1 = require("./dto/update-unit.dto.js");
const units_service_js_1 = require("./units.service.js");
let UnitsController = class UnitsController {
    unitsService;
    constructor(unitsService) {
        this.unitsService = unitsService;
    }
    findAll(slug) {
        return this.unitsService.findAll(slug);
    }
    findOne(id) {
        return this.unitsService.findOne(id);
    }
    create(slug, user, dto) {
        return this.unitsService.create(slug, user.id, user.role, dto);
    }
    update(id, user, dto) {
        return this.unitsService.update(id, user.id, user.role, dto);
    }
    remove(id, user) {
        return this.unitsService.remove(id, user.id, user.role);
    }
};
exports.UnitsController = UnitsController;
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Public: list all units for a property' }),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UnitsController.prototype, "findAll", null);
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Public: get unit detail' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UnitsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: add unit to property' }),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, create_unit_dto_js_1.CreateUnitDto]),
    __metadata("design:returntype", void 0)
], UnitsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: update a unit' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, update_unit_dto_js_1.UpdateUnitDto]),
    __metadata("design:returntype", void 0)
], UnitsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: delete a unit' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], UnitsController.prototype, "remove", null);
exports.UnitsController = UnitsController = __decorate([
    (0, swagger_1.ApiTags)('Units'),
    (0, common_1.Controller)('properties/:slug/units'),
    __metadata("design:paramtypes", [units_service_js_1.UnitsService])
], UnitsController);
//# sourceMappingURL=units.controller.js.map