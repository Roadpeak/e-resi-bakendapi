import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { MailModule } from './mail/mail.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { PropertiesModule } from './properties/properties.module.js';
import { UnitsModule } from './units/units.module.js';
import { RentListingsModule } from './rent-listings/rent-listings.module.js';
import { MediaModule } from './media/media.module.js';
import { ToursModule } from './tours/tours.module.js';
import { TwinsModule } from './twins/twins.module.js';
import { AgentsModule } from './agents/agents.module.js';
import { AmenitiesModule } from './amenities/amenities.module.js';
import { ConstructionUpdatesModule } from './construction-updates/construction-updates.module.js';
import { InquiriesModule } from './inquiries/inquiries.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { ReservationsModule } from './reservations/reservations.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { SavedPropertiesModule } from './saved-properties/saved-properties.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { BillingModule } from './billing/billing.module.js';
import { ChatModule } from './chat/chat.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { ProductionTiersModule } from './production-tiers/production-tiers.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [
    AdminModule,
    ConfigModule.forRoot({ isGlobal: true }),
    // Drives recurring listing-fee collection.
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    MailModule,
    HealthModule,
    AuthModule,
    UsersModule,
    PropertiesModule,
    UnitsModule,
    RentListingsModule,
    MediaModule,
    ToursModule,
    TwinsModule,
    AgentsModule,
    AmenitiesModule,
    ConstructionUpdatesModule,
    InquiriesModule,
    BookingsModule,
    ReservationsModule,
    DocumentsModule,
    SavedPropertiesModule,
    NotificationsModule,
    BillingModule,
    ChatModule,
    AnalyticsModule,
    ProductionTiersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
