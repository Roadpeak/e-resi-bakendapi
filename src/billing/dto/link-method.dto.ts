import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt, IsOptional, IsString, Length, Matches, Max, Min, MaxLength,
} from 'class-validator';

/**
 * Link a card. The full number and CVC are used ONLY to verify the card with
 * the processor ($1 authorization, reversed automatically) — they are never
 * persisted or logged.
 */
export class LinkCardDto {
  @ApiProperty({ example: '4242424242424242' })
  @Matches(/^\d{12,19}$/, { message: 'cardNumber must be 12–19 digits' })
  cardNumber: string;

  @ApiProperty({ example: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  expMonth: number;

  @ApiProperty({ example: 2030 })
  @IsInt()
  @Min(2024)
  @Max(2060)
  expYear: number;

  @ApiProperty({ example: '123' })
  @Matches(/^\d{3,4}$/, { message: 'cvc must be 3 or 4 digits' })
  cvc: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @Length(2, 80)
  cardholderName: string;

  // ── Billing address ──
  @ApiProperty({ example: 'Riverside Drive 12' })
  @IsString()
  @Length(2, 120)
  addressLine1: string;

  @ApiPropertyOptional({ example: 'Apt 4B' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  addressLine2?: string;

  @ApiProperty({ example: 'Nairobi' })
  @IsString()
  @Length(2, 60)
  city: string;

  @ApiProperty({ example: '00100' })
  @IsString()
  @Length(2, 12)
  postalCode: string;

  @ApiProperty({ example: 'KE' })
  @IsString()
  @Length(2, 2, { message: 'country must be a 2-letter ISO code' })
  country: string;
}

export class PayMpesaDto {
  @ApiProperty({ example: '254712345678', description: 'Safaricom number in 2547XXXXXXXX / 2541XXXXXXXX format' })
  @Matches(/^254(7|1)\d{8}$/, { message: 'phone must be in 2547XXXXXXXX or 2541XXXXXXXX format' })
  phone: string;

  @ApiProperty({ example: 49, description: 'Amount to pay in USD (converted to KES for the STK push)' })
  @IsInt()
  @Min(1)
  @Max(100000)
  amountUsd: number;

  @ApiPropertyOptional({ example: 'Monthly listing fees' })
  @IsOptional()
  @IsString()
  @MaxLength(90)
  purpose?: string;
}

export class PaypalConfirmDto {
  @ApiProperty({ description: 'Agreement token returned from the PayPal approval redirect' })
  @IsString()
  @Length(4, 128)
  token: string;
}
