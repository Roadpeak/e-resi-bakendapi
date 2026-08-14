import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateReservationDto {
  @ApiProperty({ description: 'Unit ID to reserve' })
  @IsString()
  @IsNotEmpty()
  unitId: string;

  @ApiPropertyOptional({ example: '2026-08-01', description: 'Reservation expiry date (defaults to 48h from now)' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({
    description: 'Agent who introduced this buyer, from ?ref= on a shared link',
  })
  @IsOptional()
  @IsString()
  agentId?: string;
}
