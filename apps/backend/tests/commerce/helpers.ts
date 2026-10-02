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
