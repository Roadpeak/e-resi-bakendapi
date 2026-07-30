"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = require("pg");
const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new adapter_pg_1.PrismaPg(pool);
const prismaInstance = new client_1.PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
let PrismaService = class PrismaService {
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
    get productionTier() { return prismaInstance.productionTier; }
};
exports.PrismaService = PrismaService;
exports.PrismaService = PrismaService = __decorate([
    (0, common_1.Injectable)()
], PrismaService);
//# sourceMappingURL=prisma.service.js.map