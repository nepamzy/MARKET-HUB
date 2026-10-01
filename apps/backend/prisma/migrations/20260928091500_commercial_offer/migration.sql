-- CreateEnum
CREATE TYPE "OfferAvailability" AS ENUM ('AVAILABLE', 'OUT_OF_STOCK', 'TEMPORARILY_UNAVAILABLE', 'DISCONTINUED');

-- CreateTable
CREATE TABLE "commercial_offers" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "availability" "OfferAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "maxQuantity" INTEGER,
    "orderIncrement" INTEGER,
    "leadTimeDays" INTEGER,
    "leadTimeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_offers_pkey" PRIMARY KEY ("id"),
    -- Value-level sanity checks that ARE enforceable per-row at the DB
    -- layer (the cross-table maxQuantity >= Product.minimumOrderQuantity
    -- rule is not, and lives in the service layer instead).
    CONSTRAINT "commercial_offers_maxQuantity_positive" CHECK ("maxQuantity" IS NULL OR "maxQuantity" > 0),
    CONSTRAINT "commercial_offers_orderIncrement_positive" CHECK ("orderIncrement" IS NULL OR "orderIncrement" > 0),
    CONSTRAINT "commercial_offers_leadTimeDays_nonnegative" CHECK ("leadTimeDays" IS NULL OR "leadTimeDays" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "commercial_offers_productId_key" ON "commercial_offers"("productId");

-- AddForeignKey
ALTER TABLE "commercial_offers" ADD CONSTRAINT "commercial_offers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
