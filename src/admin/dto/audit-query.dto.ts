import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

/**
 * Extends PaginationDto because the global ValidationPipe runs with
 * forbidNonWhitelisted — any query param not declared here is rejected.
 */
export class AuditQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by the admin who acted' })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({ example: 'user.suspend' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ example: 'Property' })
  @IsOptional()
  @IsString()
  targetType?: string;
}
