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
exports.ReservationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_js_1 = require("../common/decorators/current-user.decorator.js");
const roles_decorator_js_1 = require("../common/decorators/roles.decorator.js");
const pagination_dto_js_1 = require("../common/dto/pagination.dto.js");
const create_reservation_dto_js_1 = require("./dto/create-reservation.dto.js");
const reservations_service_js_1 = require("./reservations.service.js");
let ReservationsController = class ReservationsController {
    service;
    constructor(service) {
        this.service = service;
    }
    create(dto, user) {
        return this.service.create(dto, user.id);
    }
    findAll(pagination, stage) {
        return this.service.findAll(pagination, stage);
    }
    findMine(user, pagination) {
        return this.service.findMine(user.id, pagination);
    }
    findForDeveloper(user, pagination) {
        return this.service.findForDeveloper(user.id, pagination);
    }
    findOne(id, user) {
        return this.service.findOne(id, user.id, user.role);
    }
    advanceStage(id, user, stage) {
        return this.service.advanceStage(id, user.id, user.role, stage);
    }
    cancel(id, user) {
        return this.service.cancel(id, user.id, user.role);
    }
};
exports.ReservationsController = ReservationsController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Reserve a unit (authenticated buyers/investors)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_reservation_dto_js_1.CreateReservationDto, Object]),
    __metadata("design:returntype", void 0)
], ReservationsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Admin: list all reservations' }),
    (0, swagger_1.ApiQuery)({ name: 'stage', enum: client_1.ReservationStage, required: false }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)('stage')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pagination_dto_js_1.PaginationDto, String]),
    __metadata("design:returntype", void 0)
], ReservationsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('mine'),
    (0, swagger_1.ApiOperation)({ summary: 'User: list own reservations' }),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, pagination_dto_js_1.PaginationDto]),
    __metadata("design:returntype", void 0)
], ReservationsController.prototype, "findMine", null);
__decorate([
    (0, common_1.Get)('developer'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: list reservations on own properties' }),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, pagination_dto_js_1.PaginationDto]),
    __metadata("design:returntype", void 0)
], ReservationsController.prototype, "findForDeveloper", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get reservation detail' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ReservationsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id/stage'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Developer/Admin: advance reservation through sale pipeline' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, common_1.Body)('stage')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], ReservationsController.prototype, "advanceStage", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Cancel reservation and release unit (owner or developer)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ReservationsController.prototype, "cancel", null);
exports.ReservationsController = ReservationsController = __decorate([
    (0, swagger_1.ApiTags)('Reservations'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('reservations'),
    __metadata("design:paramtypes", [reservations_service_js_1.ReservationsService])
], ReservationsController);
//# sourceMappingURL=reservations.controller.js.map