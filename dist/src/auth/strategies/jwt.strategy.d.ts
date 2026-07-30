import { ConfigService } from '@nestjs/config';
import { Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
interface JwtPayload {
    sub: string;
    email: string;
    role: string;
}
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    private readonly prisma;
    constructor(config: ConfigService, prisma: PrismaService);
    validate(payload: JwtPayload): Promise<{
        email: string;
        password: string | null;
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
        refreshToken: string | null;
        emailVerifyToken: string | null;
        passwordResetToken: string | null;
        passwordResetExpiry: Date | null;
        lastLoginAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
export {};
