import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';

export class CreateReelDto {
  @ApiProperty() @IsUrl() videoUrl: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() thumbnailUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(600) caption?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(600) durationSec?: number;
  @ApiPropertyOptional({ description: 'A property for sale the owner can market' }) @IsOptional() @IsString() propertyId?: string;
  @ApiPropertyOptional({ description: 'A rental the owner manages' }) @IsOptional() @IsString() rentListingId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) neighborhood?: string;
}

export class UpdateReelDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(600) caption?: string;
  /** '' unlinks. */
  @ApiPropertyOptional() @IsOptional() @IsString() propertyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rentListingId?: string;
  @ApiPropertyOptional({ enum: ['PUBLISHED', 'HIDDEN'] }) @IsOptional() @IsIn(['PUBLISHED', 'HIDDEN']) status?: 'PUBLISHED' | 'HIDDEN';
}

export class FeedQueryDto {
  @ApiPropertyOptional({ enum: ['SALE', 'RENT'] }) @IsOptional() @IsIn(['SALE', 'RENT']) deal?: 'SALE' | 'RENT';
  @ApiPropertyOptional() @IsOptional() @IsString() agentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() developerId?: string;
  @ApiPropertyOptional({ description: 'Show this reel first' }) @IsOptional() @IsString() start?: string;
  @ApiPropertyOptional({ description: 'Anonymous visitor id, for personalising signed-out feeds' }) @IsOptional() @IsString() @MaxLength(64) visitorId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30) limit?: number;
}

export class ViewReelDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) visitorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(3_600_000) watchedMs?: number;
}

export class CommentDto {
  @ApiProperty() @IsString() @MaxLength(1000) body: string;
  @ApiPropertyOptional({ description: 'Reply to this comment (reel owner only)' }) @IsOptional() @IsString() parentId?: string;
}

export class AdminReelsQueryDto {
  @ApiPropertyOptional({ enum: ['PUBLISHED', 'HIDDEN', 'REMOVED'] }) @IsOptional() @IsIn(['PUBLISHED', 'HIDDEN', 'REMOVED']) status?: 'PUBLISHED' | 'HIDDEN' | 'REMOVED';
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
}

export class AdminReelStatusDto {
  @ApiProperty({ enum: ['PUBLISHED', 'REMOVED'] }) @IsIn(['PUBLISHED', 'REMOVED']) status: 'PUBLISHED' | 'REMOVED';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) reason?: string;
}
