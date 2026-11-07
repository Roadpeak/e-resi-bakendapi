import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GoogleOneTapDto {
  /** The ID token (JWT) Google Identity Services hands the page. */
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  credential: string;

  /** Account type for a NEW account; existing accounts keep theirs. */
  @ApiPropertyOptional({ enum: ['INVESTOR', 'TENANT'] })
  @IsOptional()
  @IsIn(['INVESTOR', 'TENANT'])
  role?: 'INVESTOR' | 'TENANT';
}
