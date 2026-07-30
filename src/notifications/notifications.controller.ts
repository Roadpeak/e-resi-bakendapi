import { Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications' })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  findMine(
    @CurrentUser() user: { id: string },
    @Query() pagination: PaginationDto,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.service.findMine(user.id, pagination, unreadOnly === 'true');
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  unreadCount(@CurrentUser() user: { id: string }) {
    return this.service.unreadCount(user.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser() user: { id: string }) {
    return this.service.markAllRead(user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  markRead(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.markRead(id, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, user.id);
  }
}
