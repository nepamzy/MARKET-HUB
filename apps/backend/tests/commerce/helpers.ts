import request from "supertest";
import type { Express } from "express";
import { registerAndLogin } from "../helpers";

export async function createSeller(app: Express, businessType = "RETAILER") {
  const owner = await registerAndLogin(app);
  const orgRes = await request(app)
    .post("/api/organizations")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ legalName: `Seller Co ${Math.random()}`, businessType });
  return { owner, organizationId: orgRes.body.organization.id as string };
}

interface SellableProductOptions {
  name?: string;
  unitPriceMinor?: number;
  currency?: string;
  minimumOrderQuantity?: number;
  maxQuantity?: number;
  orderIncrement?: number;
  availability?: string;
  extraPrices?: Array<{ tier: string; minQuantity: number; unitPriceMinor: number; currency: string }>;
}

/** Creates an ACTIVE, discoverable, purchasable product with a RETAIL price. */
export async function createSellableProduct(
  app: Express,
  sellerToken: string,
  organizationId: string,
  opts: SellableProductOptions = {}
) {
  const createRes = await request(app)
    .post(`/api/organizations/${organizationId}/products`)
    .set("Authorization", `Bearer ${sellerToken}`)
    .send({
      name: opts.name ?? "Bottled Water Case",
      minimumOrderQuantity: opts.minimumOrderQuantity,
      prices: [
        { tier: "RETAIL", minQuantity: 1, unitPriceMinor: opts.unitPriceMinor ?? 1000, currency: opts.currency ?? "NGN" },
        ...(opts.extraPrices ?? []),
      ],
      commercialOffer: {
        availability: opts.availability ?? "AVAILABLE",
        maxQuantity: opts.maxQuantity,
        orderIncrement: opts.orderIncrement,
      },
    });
  if (createRes.status !== 201) {
    throw new Error(`Product creation failed in test helper: ${createRes.status} ${JSON.stringify(createRes.body)}`);
  }
  const productId = createRes.body.id as string;

  const activateRes = await request(app)
    .patch(`/api/organizations/${organizationId}/products/${productId}`)
    .set("Authorization", `Bearer ${sellerToken}`)
    .send({ status: "ACTIVE", isDiscoverable: true });
  if (activateRes.status !== 200) {
    throw new Error(`Product activation failed in test helper: ${activateRes.status} ${JSON.stringify(activateRes.body)}`);
  }

  return productId;
}

/**
 * Creates one real Order via the real checkout flow (seller + product +
 * cart + checkout) for a fresh buyer, so Phase 10 payment tests attach to
 * a genuine Order rather than an inserted fixture row.
 */
export async function createOrderForNewBuyer(
  app: Express,
  opts: { unitPriceMinor?: number; currency?: string; quantity?: number } = {}
) {
  const seller = await createSeller(app);
  const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId, {
    unitPriceMinor: opts.unitPriceMinor ?? 2500,
    currency: opts.currency ?? "NGN",
  });
  const buyer = await registerAndLogin(app);
  await request(app)
    .post("/api/cart/items")
    .set("Authorization", `Bearer ${buyer.accessToken}`)
    .send({ productId, quantity: opts.quantity ?? 2 });

  const checkoutRes = await request(app).post("/api/checkout").set("Authorization", `Bearer ${buyer.accessToken}`);
  if (checkoutRes.status !== 201) {
    throw new Error(`Checkout failed in test helper: ${checkoutRes.status} ${JSON.stringify(checkoutRes.body)}`);
  }

  return { buyer, seller, order: checkoutRes.body.orders[0] as { id: string; totalMinor: number; currency: string } };
}
