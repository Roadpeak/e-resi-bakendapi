import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    register(dto: RegisterDto): Promise<{
        message: string;
    }>;
    login(dto: LoginDto, res: Response): Promise<{
        accessToken: string;
        user: {
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
        };
    }>;
    logout(user: {
        id: string;
    }, res: Response): Promise<{
        message: string;
    }>;
    refresh(req: Request, res: Response): Promise<{
        accessToken: string;
    }> | {
        message: string;
    };
    verifyEmail(token: string): Promise<{
        message: string;
    }>;
    forgotPassword(dto: ForgotPasswordDto): Promise<{
        message: string;
    }>;
    resetPassword(dto: ResetPasswordDto, res: Response): Promise<{
        message: string;
    }>;
    getMe(user: {
        id: string;
    }): Promise<{
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
    updateMe(user: {
        id: string;
    }, dto: UpdateProfileDto): Promise<{
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
}
