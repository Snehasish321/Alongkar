-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "InventoryMovementType" AS ENUM ('DEDUCTION', 'RESTORATION_CANCELLATION', 'RESTORATION_RETURN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "InventoryMovement" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reason" TEXT,
    "clerkUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryMovement_idempotencyKey_key" ON "InventoryMovement"("idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InventoryMovement_orderId_type_idx" ON "InventoryMovement"("orderId", "type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InventoryMovement_productId_type_idx" ON "InventoryMovement"("productId", "type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InventoryMovement_createdAt_idx" ON "InventoryMovement"("createdAt");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
