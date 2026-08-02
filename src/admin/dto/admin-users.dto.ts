import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KybStatus, UserRole } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

/** Extends PaginationDto — forbidNonWhitelisted rejects undeclared params. */
export class ListUsersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Search name or email' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: ['active', 'suspended'] })
  @IsOptional()
  @IsIn(['active', 'suspended'])
  status?: 'active' | 'suspended';

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  verified?: string;
}

export class ListDevelopersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: KybStatus })
  @IsOptional()
  @IsEnum(KybStatus)
  kybStatus?: KybStatus;
}

export class SuspendUserDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  suspended: boolean;

  @ApiPropertyOptional({ example: 'Repeated policy violations' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class SetRoleDto {
  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;
}

export class ReviewKybDto {
  @ApiProperty({ enum: KybStatus })
  @IsEnum(KybStatus)
  status: KybStatus;

  @ApiPropertyOptional({ description: 'Reason shown to the developer' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
