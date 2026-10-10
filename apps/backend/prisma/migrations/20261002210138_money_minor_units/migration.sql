-- Phase 6 money-representation correction: ProductPrice.unitPrice
-- (Decimal(12,2)) -> ProductPrice.unitPriceMinor (Int), matching the
-- project's documented "integer minor units, never floating point" rule
-- for monetary accounting (see schema.prisma's doc comment on this model).
--
-- Data-preserving: no real transactions exist yet (pre-launch), so a
-- straightforward *100-and-round conversion is safe. Assumes 2-decimal-
-- place currencies (NGN, KES, GHS, USD), matching the Nigeria-first scope
-- already established elsewhere in this schema.
--
-- Deliberately does NOT touch the unrelated schema drift that
-- `prisma migrate dev --create-only` also proposed here (dropping
-- "supplier_profiles_isDiscoverable_isActive_idx" and removing array-column
-- defaults on supplier_profiles/products) — that drift predates this
-- migration (traced to 20260926073000_supplier_directory) and is unrelated
-- to this change; see the Phase 6 report for detail rather than bundling
-- an unrelated fix into this migration.

-- Step 1: add the new column, nullable for the backfill.
ALTER TABLE "product_prices" ADD COLUMN "unitPriceMinor" INTEGER;

-- Step 2: backfill from the existing Decimal column.
UPDATE "product_prices" SET "unitPriceMinor" = ROUND("unitPrice" * 100)::INTEGER;

-- Step 3: now safe to enforce NOT NULL.
ALTER TABLE "product_prices" ALTER COLUMN "unitPriceMinor" SET NOT NULL;

-- Step 4: drop the old column.
ALTER TABLE "product_prices" DROP COLUMN "unitPrice";
