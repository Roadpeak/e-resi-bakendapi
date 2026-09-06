-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "rentUnitId" TEXT;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_rentUnitId_fkey" FOREIGN KEY ("rentUnitId") REFERENCES "RentUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

