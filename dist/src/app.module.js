"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const throttler_1 = require("@nestjs/throttler");
const prisma_module_js_1 = require("./prisma/prisma.module.js");
const mail_module_js_1 = require("./mail/mail.module.js");
const health_module_js_1 = require("./health/health.module.js");
const auth_module_js_1 = require("./auth/auth.module.js");
const users_module_js_1 = require("./users/users.module.js");
const properties_module_js_1 = require("./properties/properties.module.js");
const units_module_js_1 = require("./units/units.module.js");
const rent_listings_module_js_1 = require("./rent-listings/rent-listings.module.js");
const media_module_js_1 = require("./media/media.module.js");
const tours_module_js_1 = require("./tours/tours.module.js");
const amenities_module_js_1 = require("./amenities/amenities.module.js");
const construction_updates_module_js_1 = require("./construction-updates/construction-updates.module.js");
const inquiries_module_js_1 = require("./inquiries/inquiries.module.js");
const bookings_module_js_1 = require("./bookings/bookings.module.js");
const reservations_module_js_1 = require("./reservations/reservations.module.js");
const documents_module_js_1 = require("./documents/documents.module.js");
const saved_properties_module_js_1 = require("./saved-properties/saved-properties.module.js");
const notifications_module_js_1 = require("./notifications/notifications.module.js");
const analytics_module_js_1 = require("./analytics/analytics.module.js");
const production_tiers_module_js_1 = require("./production-tiers/production-tiers.module.js");
const app_controller_js_1 = require("./app.controller.js");
const app_service_js_1 = require("./app.service.js");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            throttler_1.ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
            prisma_module_js_1.PrismaModule,
            mail_module_js_1.MailModule,
            health_module_js_1.HealthModule,
            auth_module_js_1.AuthModule,
            users_module_js_1.UsersModule,
            properties_module_js_1.PropertiesModule,
            units_module_js_1.UnitsModule,
            rent_listings_module_js_1.RentListingsModule,
            media_module_js_1.MediaModule,
            tours_module_js_1.ToursModule,
            amenities_module_js_1.AmenitiesModule,
            construction_updates_module_js_1.ConstructionUpdatesModule,
            inquiries_module_js_1.InquiriesModule,
            bookings_module_js_1.BookingsModule,
            reservations_module_js_1.ReservationsModule,
            documents_module_js_1.DocumentsModule,
            saved_properties_module_js_1.SavedPropertiesModule,
            notifications_module_js_1.NotificationsModule,
            analytics_module_js_1.AnalyticsModule,
            production_tiers_module_js_1.ProductionTiersModule,
        ],
        controllers: [app_controller_js_1.AppController],
        providers: [app_service_js_1.AppService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map