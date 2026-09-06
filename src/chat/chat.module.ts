import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AgentsModule } from '../agents/agents.module.js';
import { ChatController } from './chat.controller.js';
import { ChatGateway } from './chat.gateway.js';
import { ChatService } from './chat.service.js';

@Module({
  // AgentsModule for DealsService: capturing a chat counterpart as a lead
  // opens a Deal when the capturing side is an agent, and the deal rules
  // (partnership checks, event trail, notifications) must be the same ones
  // the deals page itself applies.
  imports: [JwtModule.register({}), AgentsModule],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}
