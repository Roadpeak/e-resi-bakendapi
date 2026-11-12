import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { InvitesAdminController } from './invites-admin.controller.js';
import { InvitesController } from './invites.controller.js';
import { InvitesService } from './invites.service.js';

@Module({
  imports: [AuthModule, AdminModule],
  controllers: [InvitesController, InvitesAdminController],
  providers: [InvitesService],
})
export class InvitesModule {}
