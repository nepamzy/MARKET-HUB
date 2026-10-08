import type { PriceTier, ProductUnit } from "@market-hub/shared";
import { assertStockAvailable } from "../modules/inventory/inventory.service";
import { AppError } from "./errors";
import { prisma } from "./prisma";

/**
 * Authoritative, server-resolved purchase terms for one product at one
 * quantity. Never trust a client-submitted price or total (Phase 6 §8) —
 * this is the single place that computes one, reused by both cart display
 * (so the buyer sees real numbers before checkout) and checkout itself
 * (so the numbers that create the order are independently re-verified,
 * not copied from whatever the cart happened to show a moment earlier).
 *
 * Marketplace carts always resolve RETAIL-tier pricing — see CartItem's
 * doc comment in schema.prisma for why (WHOLESALE/BUSINESS tiers belong to
 * the B2B procurement system, out of scope for Phase 6).
 */
const CART_TIER: PriceTier = "RETAIL";

export interface ResolvedPurchaseTerms {
  productId: string;
  productName: string;
  sellerOrganizationId: string;
  sellerOrganizationName: string;
  unit: ProductUnit;
  tier: PriceTier;
  quantity: number;
  productPriceId: string;
  unitPriceMinor: number;
  currency: string;
  lineTotalMinor: number;
}

/**
 * Resolves and validates a (productId, quantity) pair against current,
 * live product/offer/pricing state. Throws AppError.badRequest with a
 * specific, user-facing reason on any violation (Phase 6 §8's quantity/
 * availability rules) — callers surface that message directly rather than
 * translating it, so keep messages specific here.
 */
export async function resolvePurchaseTerms(productId: string, quantity: number): Promise<ResolvedPurchaseTerms> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      unit: true,
      status: true,
      isDiscoverable: true,
      minimumOrderQuantity: true,
      organization: { select: { id: true, legalName: true, status: true } },
      commercialOffer: { select: { availability: true, maxQuantity: true, orderIncrement: true } },
      prices: {
        where: { tier: CART_TIER },
        select: { id: true, minQuantity: true, unitPriceMinor: true, currency: true },
        orderBy: { minQuantity: "asc" },
      },
    },
  });

  if (!product || product.status !== "ACTIVE" || !product.isDiscoverable || product.organization.status !== "ACTIVE") {
    throw AppError.badRequest("This product is no longer available for purchase");
  }

  const availability = product.commercialOffer?.availability ?? "AVAILABLE";
  if (availability !== "AVAILABLE") {
    throw AppError.badRequest(`This product is currently ${availability.toLowerCase().replace(/_/g, " ")}`);
  }

  if (product.minimumOrderQuantity != null && quantity < product.minimumOrderQuantity) {
    throw AppError.badRequest(`Minimum order quantity is ${product.minimumOrderQuantity}`);
  }

  const maxQuantity = product.commercialOffer?.maxQuantity;
  if (maxQuantity != null && quantity > maxQuantity) {
    throw AppError.badRequest(`Maximum order quantity is ${maxQuantity}`);
  }

  const orderIncrement = product.commercialOffer?.orderIncrement;
  if (orderIncrement != null && quantity % orderIncrement !== 0) {
    throw AppError.badRequest(`Quantity must be ordered in multiples of ${orderIncrement}`);
  }

  // Best matching breakpoint: the highest minQuantity that is still <= the
  // requested quantity (prices are pre-sorted ascending by minQuantity).
  const priceRow = [...product.prices].reverse().find((p) => p.minQuantity <= quantity);
  if (!priceRow) {
    throw AppError.badRequest("No price is available for this product at the requested quantity");
  }

  // Phase 11 — advisory only (a product with no Inventory row is
  // untracked and always passes). The authoritative guard that actually
  // prevents overselling is the transactional reservation inside
  // checkout() itself; this just gives an early, specific error at
  // cart-add/checkout time instead of a generic conflict.
  await assertStockAvailable(product.id, product.name, quantity);

  return {
    productId: product.id,
    productName: product.name,
    sellerOrganizationId: product.organization.id,
    sellerOrganizationName: product.organization.legalName,
    unit: product.unit,
    tier: CART_TIER,
    quantity,
    productPriceId: priceRow.id,
    unitPriceMinor: priceRow.unitPriceMinor,
    currency: priceRow.currency,
    lineTotalMinor: priceRow.unitPriceMinor * quantity,
  };
}
