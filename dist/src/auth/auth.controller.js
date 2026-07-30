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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_js_1 = require("../common/decorators/current-user.decorator.js");
const public_decorator_js_1 = require("../common/decorators/public.decorator.js");
const auth_service_js_1 = require("./auth.service.js");
const forgot_password_dto_js_1 = require("./dto/forgot-password.dto.js");
const login_dto_js_1 = require("./dto/login.dto.js");
const register_dto_js_1 = require("./dto/register.dto.js");
const reset_password_dto_js_1 = require("./dto/reset-password.dto.js");
const update_profile_dto_js_1 = require("./dto/update-profile.dto.js");
let AuthController = class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    register(dto) {
        return this.authService.register(dto);
    }
    login(dto, res) {
        return this.authService.login(dto, res);
    }
    logout(user, res) {
        return this.authService.logout(user.id, res);
    }
    refresh(req, res) {
        const cookie = req.cookies['refresh_token'];
        if (!cookie) {
            return { message: 'No refresh token' };
        }
        return this.authService.refresh(cookie, res);
    }
    verifyEmail(token) {
        return this.authService.verifyEmail(token);
    }
    forgotPassword(dto) {
        return this.authService.forgotPassword(dto);
    }
    resetPassword(dto, res) {
        return this.authService.resetPassword(dto, res);
    }
    getMe(user) {
        return this.authService.getMe(user.id);
    }
    updateMe(user, dto) {
        return this.authService.updateMe(user.id, dto);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Post)('register'),
    (0, swagger_1.ApiOperation)({ summary: 'Register a new account (Developer / Investor / Tenant)' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [register_dto_js_1.RegisterDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "register", null);
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Login with email + password' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_js_1.LoginDto, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Logout and invalidate refresh token' }),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "logout", null);
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Post)('refresh'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Rotate refresh token and get a new access token' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Get)('verify-email'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Verify email address with token from email link' }),
    __param(0, (0, common_1.Query)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "verifyEmail", null);
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Post)('forgot-password'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Request a password reset email' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [forgot_password_dto_js_1.ForgotPasswordDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "forgotPassword", null);
__decorate([
    (0, public_decorator_js_1.Public)(),
    (0, common_1.Post)('reset-password'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Reset password using token from email' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reset_password_dto_js_1.ResetPasswordDto, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "resetPassword", null);
__decorate([
    (0, common_1.Get)('me'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get current authenticated user profile' }),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "getMe", null);
__decorate([
    (0, common_1.Patch)('me'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Update current user profile' }),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_profile_dto_js_1.UpdateProfileDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "updateMe", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('Auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_js_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map