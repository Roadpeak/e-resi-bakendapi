import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Jane' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  lastName: string;

  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'P@ssword123', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ApiProperty({ enum: ['DEVELOPER', 'INVESTOR', 'TENANT'] })
  @IsIn(['DEVELOPER', 'INVESTOR', 'TENANT'], {
    message: 'role must be one of: DEVELOPER, INVESTOR, TENANT',
  })
  role: 'DEVELOPER' | 'INVESTOR' | 'TENANT';

  @ApiPropertyOptional({ example: '+254712345678' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Invalid phone number format' })
  phone?: string;

  @ApiPropertyOptional({ example: 'Acme Developers Ltd' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyName?: string;
}
