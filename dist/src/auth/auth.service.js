"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const bcrypt = __importStar(require("bcryptjs"));
const crypto_1 = require("crypto");
const mail_service_js_1 = require("../mail/mail.service.js");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
let AuthService = class AuthService {
    prisma;
    jwt;
    config;
    mail;
    isProd;
    constructor(prisma, jwt, config, mail) {
        this.prisma = prisma;
        this.jwt = jwt;
        this.config = config;
        this.mail = mail;
        this.isProd = config.get('NODE_ENV') === 'production';
    }
    sha256(value) {
        return (0, crypto_1.createHash)('sha256').update(value).digest('hex');
    }
    generateToken() {
        return (0, crypto_1.randomBytes)(32).toString('hex');
    }
    sanitize(user) {
        const { password, refreshToken, emailVerifyToken, passwordResetToken, passwordResetExpiry, ...safe } = user;
        return safe;
    }
    buildRefreshCookieValue(userId, rawToken) {
        return `${userId}.${rawToken}`;
    }
    setRefreshCookie(res, userId, rawToken) {
        res.cookie('refresh_token', this.buildRefreshCookieValue(userId, rawToken), {
            httpOnly: true,
            sameSite: 'strict',
            secure: this.isProd,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
        });
    }
    clearRefreshCookie(res) {
        res.clearCookie('refresh_token', { httpOnly: true, sameSite: 'strict', path: '/' });
    }
    signAccess(user) {
        return this.jwt.sign({ sub: user.id, email: user.email, role: user.role }, { expiresIn: '15m' });
    }
    async register(dto) {
        const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (existing)
            throw new common_1.ConflictException('Email already registered');
        if (dto.phone) {
            const phoneTaken = await this.prisma.user.findFirst({ where: { phone: dto.phone } });
            if (phoneTaken)
                throw new common_1.ConflictException('Phone number already registered');
        }
        if (dto.role === 'DEVELOPER' && !dto.companyName) {
            throw new common_1.BadRequestException('companyName is required for Developer accounts');
        }
        const passwordHash = await bcrypt.hash(dto.password, 12);
        const rawVerifyToken = this.generateToken();
        const hashedVerifyToken = this.sha256(rawVerifyToken);
        const user = await this.prisma.user.create({
            data: {
                email: dto.email,
                password: passwordHash,
                firstName: dto.firstName,
                lastName: dto.lastName,
                phone: dto.phone,
                role: dto.role,
                emailVerifyToken: hashedVerifyToken,
            },
        });
        if (dto.role === 'DEVELOPER') {
            await this.prisma.developerProfile.create({
                data: { userId: user.id, companyName: dto.companyName },
            });
        }
        await this.mail.sendVerificationEmail(user.email, rawVerifyToken);
        return { message: 'Registration successful. Check your email to verify your account.' };
    }
    async login(dto, res) {
        const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (!user || !user.password)
            throw new common_1.UnauthorizedException('Invalid credentials');
        const valid = await bcrypt.compare(dto.password, user.password);
        if (!valid)
            throw new common_1.UnauthorizedException('Invalid credentials');
        if (!user.isActive)
            throw new common_1.ForbiddenException('Account is disabled');
        if (!user.emailVerified)
            throw new common_1.ForbiddenException('Please verify your email before logging in');
        const rawRefresh = this.generateToken();
        const hashedRefresh = this.sha256(rawRefresh);
        await this.prisma.user.update({
            where: { id: user.id },
            data: { refreshToken: hashedRefresh, lastLoginAt: new Date() },
        });
        this.setRefreshCookie(res, user.id, rawRefresh);
        return { accessToken: this.signAccess(user), user: this.sanitize(user) };
    }
    async logout(userId, res) {
        await this.prisma.user.update({ where: { id: userId }, data: { refreshToken: null } });
        this.clearRefreshCookie(res);
        return { message: 'Logged out successfully' };
    }
    async refresh(cookieValue, res) {
        const dotIndex = cookieValue.indexOf('.');
        if (dotIndex === -1)
            throw new common_1.UnauthorizedException('Invalid refresh token');
        const userId = cookieValue.slice(0, dotIndex);
        const rawToken = cookieValue.slice(dotIndex + 1);
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.refreshToken)
            throw new common_1.UnauthorizedException('Invalid refresh token');
        if (!user.isActive)
            throw new common_1.ForbiddenException('Account is disabled');
        const tokenHash = this.sha256(rawToken);
        if (tokenHash !== user.refreshToken)
            throw new common_1.UnauthorizedException('Invalid refresh token');
        const newRaw = this.generateToken();
        await this.prisma.user.update({
            where: { id: user.id },
            data: { refreshToken: this.sha256(newRaw) },
        });
        this.setRefreshCookie(res, user.id, newRaw);
        return { accessToken: this.signAccess(user) };
    }
    async verifyEmail(token) {
        const hashed = this.sha256(token);
        const user = await this.prisma.user.findFirst({ where: { emailVerifyToken: hashed } });
        if (!user)
            throw new common_1.BadRequestException('Invalid or expired verification token');
        await this.prisma.user.update({
            where: { id: user.id },
            data: { emailVerified: true, emailVerifyToken: null },
        });
        return { message: 'Email verified successfully' };
    }
    async forgotPassword(dto) {
        const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (user) {
            const rawToken = this.generateToken();
            await this.prisma.user.update({
                where: { id: user.id },
                data: {
                    passwordResetToken: this.sha256(rawToken),
                    passwordResetExpiry: new Date(Date.now() + 60 * 60 * 1000),
                },
            });
            await this.mail.sendPasswordResetEmail(user.email, rawToken);
        }
        return { message: 'If that email is registered, a password reset link has been sent.' };
    }
    async resetPassword(dto, res) {
        const hashed = this.sha256(dto.token);
        const user = await this.prisma.user.findFirst({
            where: { passwordResetToken: hashed, passwordResetExpiry: { gt: new Date() } },
        });
        if (!user)
            throw new common_1.BadRequestException('Invalid or expired reset token');
        const newHash = await bcrypt.hash(dto.password, 12);
        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                password: newHash,
                passwordResetToken: null,
                passwordResetExpiry: null,
                refreshToken: null,
            },
        });
        this.clearRefreshCookie(res);
        return { message: 'Password reset successful. Please log in again.' };
    }
    async getMe(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { developerProfile: true },
        });
        if (!user)
            throw new common_1.UnauthorizedException();
        const { password, refreshToken, emailVerifyToken, passwordResetToken, passwordResetExpiry, ...safe } = user;
        return safe;
    }
    async updateMe(userId, dto) {
        if (dto.phone) {
            const phoneTaken = await this.prisma.user.findFirst({
                where: { phone: dto.phone, NOT: { id: userId } },
            });
            if (phoneTaken)
                throw new common_1.ConflictException('Phone number already in use');
        }
        const updated = await this.prisma.user.update({
            where: { id: userId },
            data: {
                ...(dto.firstName && { firstName: dto.firstName }),
                ...(dto.lastName && { lastName: dto.lastName }),
                ...(dto.phone !== undefined && { phone: dto.phone }),
                ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
            },
        });
        return this.sanitize(updated);
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService,
        jwt_1.JwtService,
        config_1.ConfigService,
        mail_service_js_1.MailService])
], AuthService);
//# sourceMappingURL=auth.service.js.map