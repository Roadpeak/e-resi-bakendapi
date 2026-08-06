import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt, IsOptional, IsString, Length, Matches, Max, Min, MaxLength,
} from 'class-validator';

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

/** Pay a specific invoice by M-Pesa STK push — the amount is the invoice's own total. */
export class PayInvoiceMpesaDto {
  @ApiProperty({ example: '254712345678', description: 'Safaricom number in 2547XXXXXXXX / 2541XXXXXXXX format' })
  @Matches(/^254(7|1)\d{8}$/, { message: 'phone must be in 2547XXXXXXXX or 2541XXXXXXXX format' })
  phone: string;
}

export class PaypalConfirmDto {
  @ApiProperty({ description: 'Agreement token returned from the PayPal approval redirect' })
  @IsString()
  @Length(4, 128)
  token: string;
}
