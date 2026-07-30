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
exports.UsersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_js_1 = require("../common/decorators/current-user.decorator.js");
const public_decorator_js_1 = require("../common/decorators/public.decorator.js");
const roles_decorator_js_1 = require("../common/decorators/roles.decorator.js");
const pagination_dto_js_1 = require("../common/dto/pagination.dto.js");
const update_developer_profile_dto_js_1 = require("./dto/update-developer-profile.dto.js");
const users_service_js_1 = require("./users.service.js");
let UsersController = class UsersController {
    usersService;
    constructor(usersService) {
        this.usersService = usersService;
    }
    findAll(pagination, role) {
        return this.usersService.findAll(pagination, role);
    }
    findOne(id) {
        return this.usersService.findOne(id);
    }
    setActive(id, isActive) {
        return this.usersService.setActive(id, isActive);
    }
    updateKybStatus(profileId, status) {
        return this.usersService.updateKybStatus(profileId, status);
    }
    getMyDeveloperProfile(user) {
        return this.usersService.getMyDeveloperProfile(user.id);
    }
    updateMyDeveloperProfile(user, dto) {
        return this.usersService.updateMyDeveloperProfile(user.id, dto);
    }
    getDeveloperProfile(userId) {
        return this.usersService.getDeveloperProfileByUserId(userId);
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Admin: list all users' }),
    (0, swagger_1.ApiQuery)({ name: 'role', enum: client_1.UserRole, required: false }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)('role')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pagination_dto_js_1.PaginationDto, String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Admin: get user by ID' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id/active'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Admin: enable or disable a user account' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('isActive')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Boolean]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "setActive", null);
__decorate([
    (0, common_1.Patch)('developers/:profileId/kyb'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Admin: update developer KYB status' }),
    __param(0, (0, common_1.Param)('profileId')),
    __param(1, (0, common_1.Body)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "updateKybStatus", null);
__decorate([
    (0, common_1.Get)('developers/me'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: get own company profile' }),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "getMyDeveloperProfile", null);
__decorate([
    (0, common_1.Patch)('developers/me'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: update own company profile' }),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_developer_profile_dto_js_1.UpdateDeveloperProfileDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "updateMyDeveloperProfile", null);
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Get)('developers/:userId/profile'),
    (0, swagger_1.ApiOperation)({ summary: 'Public: get developer profile (with active properties)' }),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "getDeveloperProfile", null);
exports.UsersController = UsersController = __decorate([
    (0, swagger_1.ApiTags)('Users'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('users'),
    __metadata("design:paramtypes", [users_service_js_1.UsersService])
], UsersController);
//# sourceMappingURL=users.controller.js.map