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
exports.ToursController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_js_1 = require("../common/decorators/current-user.decorator.js");
const public_decorator_js_1 = require("../common/decorators/public.decorator.js");
const roles_decorator_js_1 = require("../common/decorators/roles.decorator.js");
const create_cinematic_scene_dto_js_1 = require("./dto/create-cinematic-scene.dto.js");
const create_floor_plan_dto_js_1 = require("./dto/create-floor-plan.dto.js");
const create_tour_section_dto_js_1 = require("./dto/create-tour-section.dto.js");
const tours_service_js_1 = require("./tours.service.js");
let ToursController = class ToursController {
    service;
    constructor(service) {
        this.service = service;
    }
    listCinematic(slug) {
        return this.service.listCinematicScenes(slug);
    }
    addCinematic(slug, user, dto) {
        return this.service.addCinematicScene(slug, user.id, user.role, dto);
    }
    removeCinematic(id, user) {
        return this.service.removeCinematicScene(id, user.id, user.role);
    }
    list3D(slug) {
        return this.service.list3DTour(slug);
    }
    addSection(slug, user, dto) {
        return this.service.addTourSection(slug, user.id, user.role, dto);
    }
    addScene(sectionId, user, dto) {
        return this.service.addTourScene(sectionId, user.id, user.role, dto);
    }
    removeSection(id, user) {
        return this.service.removeTourSection(id, user.id, user.role);
    }
    listVR(slug) {
        return this.service.listVRTour(slug);
    }
    addVRScene(slug, user, dto) {
        return this.service.addVRScene(slug, user.id, user.role, dto);
    }
    removeVRScene(id, user) {
        return this.service.removeVRScene(id, user.id, user.role);
    }
    listFloorPlans(slug) {
        return this.service.listFloorPlans(slug);
    }
    addFloorPlan(slug, user, dto) {
        return this.service.addFloorPlan(slug, user.id, user.role, dto);
    }
    removeFloorPlan(id, user) {
        return this.service.removeFloorPlan(id, user.id, user.role);
    }
};
exports.ToursController = ToursController;
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Get)('cinematic'),
    (0, swagger_1.ApiOperation)({ summary: 'Public: list cinematic scenes for a property' }),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "listCinematic", null);
__decorate([
    (0, common_1.Post)('cinematic'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: add a cinematic scene' }),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, create_cinematic_scene_dto_js_1.CreateCinematicSceneDto]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "addCinematic", null);
__decorate([
    (0, common_1.Delete)('cinematic/:id'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: remove a cinematic scene' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "removeCinematic", null);
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Get)('3d'),
    (0, swagger_1.ApiOperation)({ summary: 'Public: get 3D tour sections + scenes for a property' }),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "list3D", null);
__decorate([
    (0, common_1.Post)('3d/sections'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: add a 3D tour section' }),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, create_tour_section_dto_js_1.CreateTourSectionDto]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "addSection", null);
__decorate([
    (0, common_1.Post)('3d/sections/:sectionId/scenes'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: add a scene to a 3D tour section' }),
    __param(0, (0, common_1.Param)('sectionId')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, create_tour_section_dto_js_1.CreateTourSceneDto]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "addScene", null);
__decorate([
    (0, common_1.Delete)('3d/sections/:id'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: remove a 3D tour section (and its scenes)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "removeSection", null);
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Get)('vr'),
    (0, swagger_1.ApiOperation)({ summary: 'Public: list VR tour scenes for a property' }),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "listVR", null);
__decorate([
    (0, common_1.Post)('vr'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: add a VR tour scene' }),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, create_tour_section_dto_js_1.CreateTourSceneDto]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "addVRScene", null);
__decorate([
    (0, common_1.Delete)('vr/:id'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: remove a VR tour scene' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "removeVRScene", null);
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Get)('floor-plans'),
    (0, swagger_1.ApiOperation)({ summary: 'Public: list floor plans for a property' }),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "listFloorPlans", null);
__decorate([
    (0, common_1.Post)('floor-plans'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: add a floor plan' }),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, create_floor_plan_dto_js_1.CreateFloorPlanDto]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "addFloorPlan", null);
__decorate([
    (0, common_1.Delete)('floor-plans/:id'),
    (0, roles_decorator_js_1.Roles)(client_1.UserRole.DEVELOPER, client_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Developer: remove a floor plan' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "removeFloorPlan", null);
exports.ToursController = ToursController = __decorate([
    (0, swagger_1.ApiTags)('Tours'),
    (0, common_1.Controller)('properties/:slug/tours'),
    __metadata("design:paramtypes", [tours_service_js_1.ToursService])
], ToursController);
//# sourceMappingURL=tours.controller.js.map