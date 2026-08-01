import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length } from 'class-validator';

export class SendVerificationCodeDto {
  @ApiProperty({ example: 'jane@developer.co.ke' })
  @IsEmail()
  email!: string;
}

export class VerifyCodeDto {
  @ApiProperty({ example: 'jane@developer.co.ke' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '482913', description: '6-digit verification code' })
  @IsString()
  @Length(6, 6)
  code!: string;
}
