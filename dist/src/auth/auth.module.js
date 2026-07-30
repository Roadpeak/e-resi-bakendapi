"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const jwt_1 = require("@nestjs/jwt");
const passport_1 = require("@nestjs/passport");
const config_1 = require("@nestjs/config");
const auth_controller_js_1 = require("./auth.controller.js");
const auth_service_js_1 = require("./auth.service.js");
const jwt_auth_guard_js_1 = require("./guards/jwt-auth.guard.js");
const roles_guard_js_1 = require("./guards/roles.guard.js");
const jwt_strategy_js_1 = require("./strategies/jwt.strategy.js");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            passport_1.PassportModule.register({ defaultStrategy: 'jwt' }),
            jwt_1.JwtModule.registerAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    secret: config.get('JWT_SECRET'),
                    signOptions: { expiresIn: '15m' },
                }),
            }),
        ],
        controllers: [auth_controller_js_1.AuthController],
        providers: [
            auth_service_js_1.AuthService,
            jwt_strategy_js_1.JwtStrategy,
            { provide: core_1.APP_GUARD, useClass: jwt_auth_guard_js_1.JwtAuthGuard },
            { provide: core_1.APP_GUARD, useClass: roles_guard_js_1.RolesGuard },
        ],
        exports: [auth_service_js_1.AuthService, jwt_1.JwtModule],
    })
], AuthModule);
//# sourceMappingURL=auth.module.js.map