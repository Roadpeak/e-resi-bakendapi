import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
export declare class PrismaService implements OnModuleInit, OnModuleDestroy {
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    get $connect(): () => import("@prisma/client/runtime/client").JsPromise<void>;
    get $disconnect(): () => import("@prisma/client/runtime/client").JsPromise<void>;
    get $transaction(): {
        <P extends import("@prisma/client").Prisma.PrismaPromise<any>[]>(arg: [...P], options?: {
            maxWait?: number;
            timeout?: number;
            isolationLevel?: import("@prisma/client").Prisma.TransactionIsolationLevel;
        }): import("@prisma/client/runtime/client").JsPromise<import("@prisma/client/runtime/client").UnwrapTuple<P>>;
        <R>(fn: (prisma: Omit<PrismaClient, import("@prisma/client/runtime/client").ITXClientDenyList>) => import("@prisma/client/runtime/client").JsPromise<R>, options?: {
            maxWait?: number;
            timeout?: number;
            isolationLevel?: import("@prisma/client").Prisma.TransactionIsolationLevel;
        }): import("@prisma/client/runtime/client").JsPromise<R>;
    };
    get $executeRaw(): <T = unknown>(query: TemplateStringsArray | import("@prisma/client/runtime/client").Sql, ...values: any[]) => import("@prisma/client").Prisma.PrismaPromise<number>;
    get $queryRaw(): <T = unknown>(query: TemplateStringsArray | import("@prisma/client/runtime/client").Sql, ...values: any[]) => import("@prisma/client").Prisma.PrismaPromise<T>;
    get user(): import("@prisma/client").Prisma.UserDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get developerProfile(): import("@prisma/client").Prisma.DeveloperProfileDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get property(): import("@prisma/client").Prisma.PropertyDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get unit(): import("@prisma/client").Prisma.UnitDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get rentListing(): import("@prisma/client").Prisma.RentListingDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get rentUnit(): import("@prisma/client").Prisma.RentUnitDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get mediaAsset(): import("@prisma/client").Prisma.MediaAssetDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get cinematicScene(): import("@prisma/client").Prisma.CinematicSceneDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get tourSection3D(): import("@prisma/client").Prisma.TourSection3DDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get tourScene3D(): import("@prisma/client").Prisma.TourScene3DDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get tourSceneVR(): import("@prisma/client").Prisma.TourSceneVRDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get floorPlan(): import("@prisma/client").Prisma.FloorPlanDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get amenity(): import("@prisma/client").Prisma.AmenityDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get constructionUpdate(): import("@prisma/client").Prisma.ConstructionUpdateDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get inquiry(): import("@prisma/client").Prisma.InquiryDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get inquiryReply(): import("@prisma/client").Prisma.InquiryReplyDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get booking(): import("@prisma/client").Prisma.BookingDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get reservation(): import("@prisma/client").Prisma.ReservationDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get document(): import("@prisma/client").Prisma.DocumentDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get savedProperty(): import("@prisma/client").Prisma.SavedPropertyDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get notification(): import("@prisma/client").Prisma.NotificationDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get analyticsEvent(): import("@prisma/client").Prisma.AnalyticsEventDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get payment(): import("@prisma/client").Prisma.PaymentDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
    get productionTier(): import("@prisma/client").Prisma.ProductionTierDelegate<import("@prisma/client/runtime/client").DefaultArgs, {
        adapter: PrismaPg;
        log: ("warn" | "error")[];
    }>;
}
