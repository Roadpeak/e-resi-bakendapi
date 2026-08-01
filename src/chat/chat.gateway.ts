import { Logger } from '@nestjs/common';
import {
  ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect,
  SubscribeMessage, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service.js';

interface AuthedSocket extends Socket {
  data: { userId?: string };
}

/**
 * Realtime chat over socket.io (namespace /chat).
 *
 * Clients connect with `auth: { token }` (the JWT access token). Each user
 * joins their personal room `user:<id>`; new messages are emitted to both
 * participants' rooms so every open tab/device updates instantly.
 */
@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: true, credentials: true },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly chat: ChatService,
  ) {}

  async handleConnection(client: AuthedSocket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined)
        ?? (client.handshake.headers.authorization?.replace(/^Bearer /, ''));
      if (!token) throw new Error('missing token');
      const payload = this.jwt.verify<{ sub: string }>(token, {
        secret: process.env.JWT_SECRET,
      });
      client.data.userId = payload.sub;
      client.join(`user:${payload.sub}`);
    } catch {
      client.emit('error', 'Unauthorized');
      client.disconnect(true);
    }
  }

  handleDisconnect() {
    // rooms clean themselves up
  }

  @SubscribeMessage('message:send')
  async onMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { conversationId: string; body: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return { error: 'Unauthorized' };
    try {
      const { message, recipientId } = await this.chat.sendMessage(
        userId,
        payload.conversationId,
        payload.body,
      );
      // deliver to both sides (all their connected tabs/devices)
      this.server.to(`user:${recipientId}`).to(`user:${userId}`).emit('message:new', message);
      return { ok: true, message };
    } catch (err) {
      return { error: (err as Error).message ?? 'Failed to send' };
    }
  }

  @SubscribeMessage('conversation:read')
  async onRead(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { conversationId: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return { error: 'Unauthorized' };
    try {
      await this.chat.getMessages(userId, payload.conversationId, 1);
      return { ok: true };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }
}
