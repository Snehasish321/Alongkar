-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'QUOTE_SENT', 'ADVANCE_PENDING', 'ADVANCE_PAID', 'SOURCING', 'PRODUCT_RECEIVED', 'BALANCE_PENDING', 'BALANCE_PAID', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'NOT_SOURCEABLE', 'CANCELLED', 'CLOSED');

-- CreateTable
CREATE TABLE "JewelleryRequest" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inspirationImageUrl" TEXT NOT NULL,
    "jewelleryType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "budget" DECIMAL(10,2),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "phone" TEXT NOT NULL,
    "additionalRequirements" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "quotedPrice" DECIMAL(10,2),
    "advanceAmount" DECIMAL(10,2),
    "remainingAmount" DECIMAL(10,2),
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JewelleryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JewelleryRequest_requestNumber_key" ON "JewelleryRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "JewelleryRequest_userId_idx" ON "JewelleryRequest"("userId");

-- CreateIndex
CREATE INDEX "JewelleryRequest_status_idx" ON "JewelleryRequest"("status");

-- CreateIndex
CREATE INDEX "JewelleryRequest_createdAt_idx" ON "JewelleryRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "JewelleryRequest" ADD CONSTRAINT "JewelleryRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
