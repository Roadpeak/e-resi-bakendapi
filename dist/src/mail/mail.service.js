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
var MailService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nodemailer = __importStar(require("nodemailer"));
let MailService = MailService_1 = class MailService {
    config;
    logger = new common_1.Logger(MailService_1.name);
    transporter;
    from;
    frontendUrl;
    constructor(config) {
        this.config = config;
        this.transporter = nodemailer.createTransport({
            host: config.get('SMTP_HOST'),
            port: config.get('SMTP_PORT', 587),
            secure: config.get('SMTP_SECURE') === 'true',
            auth: {
                user: config.get('SMTP_USER'),
                pass: config.get('SMTP_PASS'),
            },
        });
        this.from = config.get('SMTP_FROM', 'e-resi <noreply@e-resi.co.ke>');
        this.frontendUrl = config.get('FRONTEND_URL', 'http://localhost:3000');
    }
    async sendVerificationEmail(to, token) {
        const link = `${this.frontendUrl}/verify-email?token=${token}`;
        try {
            await this.transporter.sendMail({
                from: this.from,
                to,
                subject: 'Verify your e-resi email address',
                html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
            <h2 style="color:#0f172a;">Welcome to e-resi</h2>
            <p>Click the button below to verify your email address. This link expires in 24 hours.</p>
            <a href="${link}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
              Verify Email
            </a>
            <p style="margin-top:24px;color:#64748b;font-size:13px;">
              Or copy this link: <a href="${link}">${link}</a>
            </p>
          </div>
        `,
            });
        }
        catch (err) {
            this.logger.error(`Failed to send verification email to ${to}`, err);
            if (process.env.NODE_ENV !== 'production') {
                this.logger.warn(`[DEV] Verify token for ${to}: ${token}`);
                return;
            }
            throw new common_1.InternalServerErrorException('Failed to send verification email');
        }
    }
    async sendPasswordResetEmail(to, token) {
        const link = `${this.frontendUrl}/reset-password?token=${token}`;
        try {
            await this.transporter.sendMail({
                from: this.from,
                to,
                subject: 'Reset your e-resi password',
                html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
            <h2 style="color:#0f172a;">Password Reset Request</h2>
            <p>Click the button below to reset your password. This link expires in 1 hour.</p>
            <a href="${link}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
              Reset Password
            </a>
            <p style="margin-top:24px;color:#64748b;font-size:13px;">
              If you did not request a password reset, you can safely ignore this email.
            </p>
            <p style="color:#64748b;font-size:13px;">
              Or copy this link: <a href="${link}">${link}</a>
            </p>
          </div>
        `,
            });
        }
        catch (err) {
            this.logger.error(`Failed to send password reset email to ${to}`, err);
            if (process.env.NODE_ENV !== 'production') {
                this.logger.warn(`[DEV] Reset token for ${to}: ${token}`);
                return;
            }
            throw new common_1.InternalServerErrorException('Failed to send password reset email');
        }
    }
};
exports.MailService = MailService;
exports.MailService = MailService = MailService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], MailService);
//# sourceMappingURL=mail.service.js.map