import { ConfigService } from '@nestjs/config';
export declare class MailService {
    private config;
    private readonly logger;
    private readonly transporter;
    private readonly from;
    private readonly frontendUrl;
    constructor(config: ConfigService);
    sendVerificationEmail(to: string, token: string): Promise<void>;
    sendPasswordResetEmail(to: string, token: string): Promise<void>;
}
