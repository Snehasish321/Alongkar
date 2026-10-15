-- DropIndex
DROP INDEX IF EXISTS "Product_collectionId_createdAt_idx";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN IF EXISTS "collectionId";
