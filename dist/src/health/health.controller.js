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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_js_1 = require("../common/decorators/public.decorator.js");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
let HealthController = class HealthController {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async check() {
        try {
            await this.prisma.$queryRaw `SELECT 1`;
            return { status: 'ok', database: 'up', timestamp: new Date().toISOString() };
        }
        catch {
            return { status: 'error', database: 'down', timestamp: new Date().toISOString() };
        }
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Health check — DB connectivity' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "check", null);
exports.HealthController = HealthController = __decorate([
    (0, swagger_1.ApiTags)('Health'),
    (0, common_1.Controller)('health'),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], HealthController);
//# sourceMappingURL=health.controller.js.map