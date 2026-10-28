import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CloudflareService } from './cloudflare.service.js';
import { DomainsService } from './domains.service.js';

@Module({
  imports: [NotificationsModule],
  providers: [CloudflareService, DomainsService],
  exports: [DomainsService, CloudflareService],
})
export class DomainsModule {}
