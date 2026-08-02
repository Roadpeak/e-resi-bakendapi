import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { AdminSystemService } from './admin-system.service.js';
import { AuditService } from './audit.service.js';

class BroadcastDto {
  @ApiPropertyOptional({ enum: UserRole, description: 'Omit to reach every active user' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiProperty({ example: 'Scheduled maintenance' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @ApiProperty({ example: 'e-resi will be briefly unavailable on Sunday at 02:00 EAT.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  body: string;
}

class UpdateSettingValueDto {
  @ApiProperty()
  @IsString()
  value: string;
}

@ApiTags('Admin · System')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/system')
export class AdminSystemController {
  constructor(
    private readonly service: AdminSystemService,
    private readonly audit: AuditService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Admin: component health — database, mail, storage' })
  health() {
    return this.service.health();
  }

  @Get('settings')
  @ApiOperation({ summary: 'Admin: platform settings' })
  settings(@Query('group') group?: string) {
    return this.service.settings(group);
  }

  @Patch('settings/:key')
  @ApiOperation({ summary: 'Admin: update a platform setting' })
  async updateSetting(
    @Param('key') key: string,
    @Body() dto: UpdateSettingValueDto,
    @CurrentUser() actor: { id: string },
  ) {
    const { before, after } = await this.service.updateSetting(key, dto.value);
    await this.audit.record({
      actorId: actor.id,
      action: 'system.setting.update',
      targetType: 'PlatformSetting',
      targetId: key,
      summary: `${after.label}: ${before.value} → ${after.value}`,
    });
    return after;
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Admin: recently delivered notifications' })
  notifications() {
    return this.service.recentNotifications();
  }

  @Post('broadcast')
  @ApiOperation({ summary: 'Admin: send an announcement to a role segment' })
  async broadcast(@Body() dto: BroadcastDto, @CurrentUser() actor: { id: string }) {
    const result = await this.service.broadcast(dto);
    await this.audit.record({
      actorId: actor.id,
      action: 'system.broadcast',
      summary: `"${dto.title}" sent to ${result.sent} ${dto.role ? dto.role.toLowerCase() : 'user'}${result.sent === 1 ? '' : 's'}`,
    });
    return result;
  }
}
