import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Prisma 7 requires a driver adapter — the built-in binary engine was removed.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const prismaInstance = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await prismaInstance.$connect();
  }

  async onModuleDestroy() {
    await prismaInstance.$disconnect();
  }

  get $connect() { return prismaInstance.$connect.bind(prismaInstance); }
  get $disconnect() { return prismaInstance.$disconnect.bind(prismaInstance); }
  get $transaction() { return prismaInstance.$transaction.bind(prismaInstance); }
  get $executeRaw() { return prismaInstance.$executeRaw.bind(prismaInstance); }
  get $queryRaw() { return prismaInstance.$queryRaw.bind(prismaInstance); }

  // Model accessors
  get user() { return prismaInstance.user; }
  get developerProfile() { return prismaInstance.developerProfile; }
  get property() { return prismaInstance.property; }
  get unit() { return prismaInstance.unit; }
  get rentListing() { return prismaInstance.rentListing; }
  get rentUnit() { return prismaInstance.rentUnit; }
  get mediaAsset() { return prismaInstance.mediaAsset; }
  get cinematicScene() { return prismaInstance.cinematicScene; }
  get tourSection3D() { return prismaInstance.tourSection3D; }
  get tourScene3D() { return prismaInstance.tourScene3D; }
  get tourSceneVR() { return prismaInstance.tourSceneVR; }
  get floorPlan() { return prismaInstance.floorPlan; }
  get amenity() { return prismaInstance.amenity; }
  get constructionUpdate() { return prismaInstance.constructionUpdate; }
  get inquiry() { return prismaInstance.inquiry; }
  get inquiryReply() { return prismaInstance.inquiryReply; }
  get booking() { return prismaInstance.booking; }
  get reservation() { return prismaInstance.reservation; }
  get document() { return prismaInstance.document; }
  get savedProperty() { return prismaInstance.savedProperty; }
  get notification() { return prismaInstance.notification; }
  get analyticsEvent() { return prismaInstance.analyticsEvent; }
  get payment() { return prismaInstance.payment; }
  get linkedPaymentMethod() { return prismaInstance.linkedPaymentMethod; }
  get conversation() { return prismaInstance.conversation; }
  get chatMessage() { return prismaInstance.chatMessage; }
  get productionTier() { return prismaInstance.productionTier; }
  get auditLog() { return prismaInstance.auditLog; }
  get pricingPlan() { return prismaInstance.pricingPlan; }
  get serviceCatalogItem() { return prismaInstance.serviceCatalogItem; }
  get servicePriceOverride() { return prismaInstance.servicePriceOverride; }
  get platformSetting() { return prismaInstance.platformSetting; }
  get listingFeeRun() { return prismaInstance.listingFeeRun; }
  get invoice() { return prismaInstance.invoice; }
  get receipt() { return prismaInstance.receipt; }
  get productionOrder() { return prismaInstance.productionOrder; }
}
