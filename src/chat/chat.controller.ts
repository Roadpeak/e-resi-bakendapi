import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ChatService } from './chat.service.js';

/** Exactly one context is expected; the service rejects a request with none. */
class StartConversationDto {
  @IsOptional()
  @IsString()
  propertySlug?: string;

  @IsOptional()
  @IsString()
  rentListingSlug?: string;

  /**
   * Message an agent directly — the route taken from the "Need agent help?"
   * picker and from an agent's own page.
   */
  @IsOptional()
  @IsString()
  agentId?: string;
}

class SendMessageDto {
  @IsString()
  @Length(1, 2000)
  body: string;
}

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly service: ChatService) {}

  @Post('conversations')
  @ApiOperation({
    summary: 'Start (or resume) a conversation — with a listing’s developer '
      + '(propertySlug/rentListingSlug) or with an agent (agentId)',
  })
  start(@CurrentUser() user: { id: string }, @Body() dto: StartConversationDto) {
    return this.service.startConversation(user.id, dto);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List my conversations with unread counts' })
  list(@CurrentUser() user: { id: string }) {
    return this.service.listConversations(user.id);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Total unread chat messages' })
  unread(@CurrentUser() user: { id: string }) {
    return this.service.unreadCount(user.id);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Message history (marks incoming as read)' })
  messages(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getMessages(user.id, id, limit ? Number.parseInt(limit, 10) : 100);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a message (REST fallback — realtime uses the socket)' })
  async send(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    const { message } = await this.service.sendMessage(user.id, id, dto.body);
    return message;
  }
}
