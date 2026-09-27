-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProductUnit" AS ENUM ('PIECE', 'PACK', 'CARTON', 'BOX', 'KILOGRAM', 'GRAM', 'LITRE', 'MILLILITRE', 'METRE', 'CASE', 'OTHER');

-- CreateEnum
CREATE TYPE "PriceTier" AS ENUM ('RETAIL', 'WHOLESALE', 'BUSINESS');

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sku" TEXT,
    "categoryId" TEXT,
    "brand" TEXT,
    "unit" "ProductUnit" NOT NULL DEFAULT 'PIECE',
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "isDiscoverable" BOOLEAN NOT NULL DEFAULT false,
    "minimumOrderQuantity" INTEGER,
    "primaryImageUrl" TEXT,
    "additionalImageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_prices" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "tier" "PriceTier" NOT NULL,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "products_organizationId_sku_key" ON "products"("organizationId", "sku");
CREATE INDEX "products_organizationId_idx" ON "products"("organizationId");
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");
CREATE INDEX "products_status_isDiscoverable_idx" ON "products"("status", "isDiscoverable");

-- CreateIndex
CREATE UNIQUE INDEX "product_prices_productId_tier_minQuantity_key" ON "product_prices"("productId", "tier", "minQuantity");
CREATE INDEX "product_prices_productId_idx" ON "product_prices"("productId");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed a starter set of multi-sector top-level categories (Phase 4 spec §9
-- examples). These are ordinary rows, not a frozen enum -- an admin
-- capability to manage categories further is future work, not this phase.
INSERT INTO "categories" ("id", "name", "slug") VALUES
  (gen_random_uuid()::text, 'Food & Beverage', 'food-beverage'),
  (gen_random_uuid()::text, 'Agriculture', 'agriculture'),
  (gen_random_uuid()::text, 'Consumer Goods', 'consumer-goods'),
  (gen_random_uuid()::text, 'Electronics', 'electronics'),
  (gen_random_uuid()::text, 'Fashion', 'fashion'),
  (gen_random_uuid()::text, 'Beauty & Personal Care', 'beauty-personal-care'),
  (gen_random_uuid()::text, 'Household', 'household'),
  (gen_random_uuid()::text, 'Industrial', 'industrial'),
  (gen_random_uuid()::text, 'Office & Business Supplies', 'office-business-supplies'),
  (gen_random_uuid()::text, 'Construction', 'construction'),
  (gen_random_uuid()::text, 'Health & Wellness', 'health-wellness'),
  (gen_random_uuid()::text, 'Automotive', 'automotive'),
  (gen_random_uuid()::text, 'Services', 'services'),
  (gen_random_uuid()::text, 'Other', 'other');
