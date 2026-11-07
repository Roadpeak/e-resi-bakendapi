import { Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { NotificationsService } from './notifications.service.js';

type Reader = { id: string; staff?: { pages: string[] } };

class NotificationQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  unreadOnly?: string;
}

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
/* A staff request carries the employer's id plus their page grants (see
   jwt.strategy); those grants decide which notifications they see. */
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications' })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  findMine(
    @CurrentUser() user: Reader,
    @Query() query: NotificationQueryDto,
  ) {
    return this.service.findMine(user.id, query, query.unreadOnly === 'true', user.staff?.pages);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  unreadCount(@CurrentUser() user: Reader) {
    return this.service.unreadCount(user.id, user.staff?.pages);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser() user: Reader) {
    return this.service.markAllRead(user.id, user.staff?.pages);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  markRead(
    @Param('id') id: string,
    @CurrentUser() user: Reader,
  ) {
    return this.service.markRead(id, user.id, user.staff?.pages);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: Reader,
  ) {
    return this.service.remove(id, user.id, user.staff?.pages);
  }
}
