-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "inventoryDeducted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "inventoryRestored" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "inventoryRestoredAt" TIMESTAMP(3);

-- Backfill: For existing orders that were already confirmed, paid, or COD, mark inventoryDeducted as true
UPDATE "Order" SET "inventoryDeducted" = true
WHERE "paymentStatus" = 'PAID'
   OR "status" IN ('CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
   OR ("paymentProvider" = 'COD' AND "status" != 'PENDING_PAYMENT');
