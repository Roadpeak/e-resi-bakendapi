import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min, ValidateIf,
} from 'class-validator';

/**
 * Link a payment method. Card numbers are NEVER accepted or stored —
 * the client sends only display metadata (brand, last4, expiry); actual
 * charging is delegated to the processor when payments go live.
 */
export class LinkMethodDto {
  @ApiProperty({ enum: ['CARD', 'PAYPAL'] })
  @IsIn(['CARD', 'PAYPAL'])
  type: 'CARD' | 'PAYPAL';

  // ── Card fields ──
  @ApiPropertyOptional({ example: 'Visa' })
  @ValidateIf((o) => o.type === 'CARD')
  @IsString()
  @Length(2, 30)
  brand?: string;

  @ApiPropertyOptional({ example: '4242' })
  @ValidateIf((o) => o.type === 'CARD')
  @Matches(/^\d{4}$/, { message: 'last4 must be exactly 4 digits' })
  last4?: string;

  @ApiPropertyOptional({ example: 12 })
  @ValidateIf((o) => o.type === 'CARD')
  @IsInt()
  @Min(1)
  @Max(12)
  expMonth?: number;

  @ApiPropertyOptional({ example: 2030 })
  @ValidateIf((o) => o.type === 'CARD')
  @IsInt()
  @Min(2024)
  @Max(2060)
  expYear?: number;

  // ── PayPal fields ──
  @ApiPropertyOptional({ example: 'you@example.com' })
  @ValidateIf((o) => o.type === 'PAYPAL')
  @IsEmail()
  paypalEmail?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  makeDefault?: boolean;
}
