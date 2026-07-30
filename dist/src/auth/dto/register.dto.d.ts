export declare class RegisterDto {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: 'DEVELOPER' | 'INVESTOR' | 'TENANT';
    phone?: string;
    companyName?: string;
}
