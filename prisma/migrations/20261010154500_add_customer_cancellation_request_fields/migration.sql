-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "CancellationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancellationRequestStatus" "CancellationRequestStatus";
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancellationRequestedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancellationRequestReason" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancellationResolvedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancellationRejectionReason" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_cancellationRequestStatus_idx" ON "Order"("cancellationRequestStatus");
