-- CreateEnum
CREATE TYPE "SupplierCapability" AS ENUM ('MANUFACTURER', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER', 'SERVICE_PROVIDER', 'OTHER');

-- CreateTable
CREATE TABLE "supplier_profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "capabilities" "SupplierCapability"[] NOT NULL DEFAULT ARRAY[]::"SupplierCapability"[],
    "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "countriesServed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "regionsServed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "citiesServed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "minimumOrderInfo" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDiscoverable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_profiles_organizationId_key" ON "supplier_profiles"("organizationId");

-- Index to support directory filtering by discoverability without a full scan
CREATE INDEX "supplier_profiles_isDiscoverable_isActive_idx" ON "supplier_profiles"("isDiscoverable", "isActive");

-- AddForeignKey
ALTER TABLE "supplier_profiles" ADD CONSTRAINT "supplier_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
