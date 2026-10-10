-- AlterTable
ALTER TABLE "Product" ADD COLUMN "availableStock" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing products: set availableStock to 10 for inStock items, 0 for out of stock items
UPDATE "Product" SET "availableStock" = CASE WHEN "inStock" = true THEN 10 ELSE 0 END;

-- CreateIndex
CREATE INDEX "Product_availableStock_idx" ON "Product"("availableStock");
