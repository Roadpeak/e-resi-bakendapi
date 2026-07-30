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
exports.BookingsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_js_1 = require("../common/decorators/current-user.decorator.js");
const public_decorator_js_1 = require("../common/decorators/public.decorator.js");
const roles_decorator_js_1 = require("../common/decorators/roles.decorator.js");
const pagination_dto_js_1 = require("../common/dto/pagination.dto.js");
const create_booking_dto_js_1 = require("./dto/create-booking.dto.js");
const bookings_service_js_1 = require("./bookings.service.js");
let BookingsController = class BookingsController {
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
    updateStatus(id, user, status, meetingUrl) {
        return this.service.updateStatus(id, user.id, user.role, status, meetingUrl);
    }
    cancel(id, user) {
        return this.service.cancel(id, user.id, user.role);
    }
};
exports.BookingsController = BookingsController;
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Book a property viewing (public or authenticated)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Query)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_booking_dto_js_1.CreateBookingDto, String]),
    __metadata("design:returntype", void 0)
], BookingsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Admin: list all bookings' }),
    (0, swagger_1.ApiQuery)({ name: 'status', enum: client_1.BookingStatus, required: false }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pagination_dto_js_1.PaginationDto, String]),
    __metadata("design:returntype", void 0)
], BookingsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('mine'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Authenticated user: list own bookings' }),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, pagination_dto_js_1.PaginationDto]),
    __metadata("design:returntype", void 0)
], BookingsController.prototype, "findMine", null);
__decorate([
    (0, common_1.Get)('developer'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: list bookings for own properties' }),
    (0, swagger_1.ApiQuery)({ name: 'status', enum: client_1.BookingStatus, required: false }),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, pagination_dto_js_1.PaginationDto, String]),
    __metadata("design:returntype", void 0)
], BookingsController.prototype, "findForDeveloper", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer/Admin: confirm, complete, or no-show a booking' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, common_1.Body)('status')),
    __param(3, (0, common_1.Body)('meetingUrl')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String]),
    __metadata("design:returntype", void 0)
], BookingsController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Patch)(':id/cancel'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Cancel a booking (owner, developer, or admin)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BookingsController.prototype, "cancel", null);
exports.BookingsController = BookingsController = __decorate([
    (0, swagger_1.ApiTags)('Bookings'),
    (0, common_1.Controller)('bookings'),
    __metadata("design:paramtypes", [bookings_service_js_1.BookingsService])
], BookingsController);
//# sourceMappingURL=bookings.controller.js.map