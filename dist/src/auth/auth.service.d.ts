import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import type { Response } from 'express';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { ResetPasswordDto } from './dto/reset-password.dto.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';
type SafeUser = Omit<User, 'password' | 'refreshToken' | 'emailVerifyToken' | 'passwordResetToken' | 'passwordResetExpiry'>;
export declare class AuthService {
    private readonly prisma;
    private readonly jwt;
    private readonly config;
    private readonly mail;
    private readonly isProd;
    constructor(prisma: PrismaService, jwt: JwtService, config: ConfigService, mail: MailService);
    private sha256;
    private generateToken;
    private sanitize;
    private buildRefreshCookieValue;
    private setRefreshCookie;
    private clearRefreshCookie;
    private signAccess;
    register(dto: RegisterDto): Promise<{
        message: string;
    }>;
    login(dto: LoginDto, res: Response): Promise<{
        accessToken: string;
        user: SafeUser;
    }>;
    logout(userId: string, res: Response): Promise<{
        message: string;
    }>;
    refresh(cookieValue: string, res: Response): Promise<{
        accessToken: string;
    }>;
    verifyEmail(token: string): Promise<{
        message: string;
    }>;
    forgotPassword(dto: ForgotPasswordDto): Promise<{
        message: string;
    }>;
    resetPassword(dto: ResetPasswordDto, res: Response): Promise<{
        message: string;
    }>;
    getMe(userId: string): Promise<{
        developerProfile: {
            description: string | null;
            companyName: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            logoUrl: string | null;
            establishedYear: number | null;
            completedProjects: number;
            website: string | null;
            kybStatus: import("@prisma/client").$Enums.KybStatus;
            kybDocuments: import("@prisma/client/runtime/client").JsonValue | null;
            kybReviewedAt: Date | null;
            kybReviewedBy: string | null;
            userId: string;
        } | null;
        email: string;
        firstName: string;
        lastName: string;
        role: import("@prisma/client").$Enums.UserRole;
        phone: string | null;
        avatarUrl: string | null;
        id: string;
        emailVerified: boolean;
        phoneVerified: boolean;
        isActive: boolean;
        oauthProvider: string | null;
        oauthId: string | null;
        lastLoginAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    updateMe(userId: string, dto: UpdateProfileDto): Promise<SafeUser>;
}
export {};
