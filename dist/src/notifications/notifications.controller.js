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
exports.NotificationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_js_1 = require("../common/decorators/current-user.decorator.js");
const pagination_dto_js_1 = require("../common/dto/pagination.dto.js");
const notifications_service_js_1 = require("./notifications.service.js");
let NotificationsController = class NotificationsController {
    service;
    constructor(service) {
        this.service = service;
    }
    findMine(user, pagination, unreadOnly) {
        return this.service.findMine(user.id, pagination, unreadOnly === 'true');
    }
    unreadCount(user) {
        return this.service.unreadCount(user.id);
    }
    markAllRead(user) {
        return this.service.markAllRead(user.id);
    }
    markRead(id, user) {
        return this.service.markRead(id, user.id);
    }
    remove(id, user) {
        return this.service.remove(id, user.id);
    }
};
exports.NotificationsController = NotificationsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List notifications' }),
    (0, swagger_1.ApiQuery)({ name: 'unreadOnly', required: false, type: Boolean }),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Query)('unreadOnly')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, pagination_dto_js_1.PaginationDto, String]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "findMine", null);
__decorate([
    (0, common_1.Get)('unread-count'),
    (0, swagger_1.ApiOperation)({ summary: 'Get unread notification count' }),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "unreadCount", null);
__decorate([
    (0, common_1.Patch)('read-all'),
    (0, swagger_1.ApiOperation)({ summary: 'Mark all notifications as read' }),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "markAllRead", null);
__decorate([
    (0, common_1.Patch)(':id/read'),
    (0, swagger_1.ApiOperation)({ summary: 'Mark a notification as read' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "markRead", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a notification' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "remove", null);
exports.NotificationsController = NotificationsController = __decorate([
    (0, swagger_1.ApiTags)('Notifications'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('notifications'),
    __metadata("design:paramtypes", [notifications_service_js_1.NotificationsService])
], NotificationsController);
//# sourceMappingURL=notifications.controller.js.map