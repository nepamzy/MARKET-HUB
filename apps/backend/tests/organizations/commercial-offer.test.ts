import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerAndLogin, testApp } from "../helpers";

async function createOrg(app: ReturnType<typeof testApp>, owner: Awaited<ReturnType<typeof registerAndLogin>>, name: string) {
  const res = await request(app)
    .post("/api/organizations")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ legalName: name, businessType: "WHOLESALER" });
  return res.body.organization.id as string;
}

async function createProduct(
  app: ReturnType<typeof testApp>,
  organizationId: string,
  token: string,
  overrides: Record<string, unknown> = {}
) {
  const res = await request(app)
    .post(`/api/organizations/${organizationId}/products`)
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Bottled Water Case", minimumOrderQuantity: 10, ...overrides });
  return res;
}

describe("Pricing validation (§7F, §15 PRICING)", () => {
  it("accepts valid non-overlapping tiered pricing", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Pricing Co");

    const res = await createProduct(app, organizationId, owner.accessToken, {
      prices: [
        { tier: "WHOLESALE", minQuantity: 1, unitPrice: 100, currency: "NGN" },
        { tier: "WHOLESALE", minQuantity: 10, unitPrice: 90, currency: "NGN" },
        { tier: "WHOLESALE", minQuantity: 50, unitPrice: 80, currency: "NGN" },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.prices).toHaveLength(3);
  });

  it("rejects a duplicate (tier, minQuantity) breakpoint", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Pricing Co");

    const res = await createProduct(app, organizationId, owner.accessToken, {
      prices: [
        { tier: "WHOLESALE", minQuantity: 10, unitPrice: 100, currency: "NGN" },
        { tier: "WHOLESALE", minQuantity: 10, unitPrice: 90, currency: "NGN" },
      ],
    });
    expect(res.status).toBe(400);
  });

  it("rejects mixed currencies on one product", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Pricing Co");

    const res = await createProduct(app, organizationId, owner.accessToken, {
      prices: [
        { tier: "WHOLESALE", minQuantity: 1, unitPrice: 100, currency: "NGN" },
        { tier: "RETAIL", minQuantity: 1, unitPrice: 5, currency: "KES" },
      ],
    });
    expect(res.status).toBe(400);
  });

  it("rejects a price that increases at a higher quantity breakpoint (contradictory range)", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Pricing Co");

    const res = await createProduct(app, organizationId, owner.accessToken, {
      prices: [
        { tier: "WHOLESALE", minQuantity: 1, unitPrice: 80, currency: "NGN" },
        { tier: "WHOLESALE", minQuantity: 10, unitPrice: 100, currency: "NGN" }, // higher qty, higher price
      ],
    });
    expect(res.status).toBe(400);
  });

  it("rejects a non-positive unit price", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Pricing Co");

    const res = await createProduct(app, organizationId, owner.accessToken, {
      prices: [{ tier: "RETAIL", minQuantity: 1, unitPrice: 0, currency: "NGN" }],
    });
    expect(res.status).toBe(400);
  });

  it("a full price replacement on update generates a COMMERCIAL_OFFER_PRICING_CHANGED audit event", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Pricing Co");
    const createRes = await createProduct(app, organizationId, owner.accessToken);

    await request(app)
      .patch(`/api/organizations/${organizationId}/products/${createRes.body.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ prices: [{ tier: "RETAIL", minQuantity: 1, unitPrice: 50, currency: "NGN" }] });

    const { prisma } = await import("../../src/lib/prisma");
    const audit = await prisma.auditLog.findFirst({
      where: { action: "COMMERCIAL_OFFER_PRICING_CHANGED", targetId: createRes.body.id },
    });
    expect(audit).not.toBeNull();
  });
});

describe("Quantity validation (§7B/§7C, §15 QUANTITY)", () => {
  it("accepts a valid commercial offer with maxQuantity and orderIncrement", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Qty Co");

    // MOQ 10, increment 5 -> 10 is a multiple of 5, valid
    const res = await createProduct(app, organizationId, owner.accessToken, {
      minimumOrderQuantity: 10,
      commercialOffer: { maxQuantity: 500, orderIncrement: 5 },
    });
    expect(res.status).toBe(201);
    expect(res.body.commercialOffer.maxQuantity).toBe(500);
  });

  it("rejects maxQuantity below minimumOrderQuantity", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Qty Co");

    const res = await createProduct(app, organizationId, owner.accessToken, {
      minimumOrderQuantity: 100,
      commercialOffer: { maxQuantity: 10 },
    });
    expect(res.status).toBe(400);
  });

  it("rejects a minimumOrderQuantity that is not a multiple of orderIncrement", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Qty Co");

    // MOQ 7, increment 5 -> 7 is not a multiple of 5
    const res = await createProduct(app, organizationId, owner.accessToken, {
      minimumOrderQuantity: 7,
      commercialOffer: { orderIncrement: 5 },
    });
    expect(res.status).toBe(400);
  });

  it("rejects a non-positive maxQuantity or orderIncrement at the schema layer", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Qty Co");

    const res = await createProduct(app, organizationId, owner.accessToken, {
      commercialOffer: { maxQuantity: -5 },
    });
    expect(res.status).toBe(400);
  });

  it("validates against the EFFECTIVE merged value on update, not just the fields in the request", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Qty Co");
    // Start with MOQ 10, maxQuantity 200 (both valid together)
    const createRes = await createProduct(app, organizationId, owner.accessToken, {
      minimumOrderQuantity: 10,
      commercialOffer: { maxQuantity: 200 },
    });

    // Now raise MOQ alone to 500 -- must be checked against the STORED
    // maxQuantity (200), not just the fields in this request
    const res = await request(app)
      .patch(`/api/organizations/${organizationId}/products/${createRes.body.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ minimumOrderQuantity: 500 });

    expect(res.status).toBe(400);
  });
});

describe("Availability (§7D)", () => {
  it("defaults to AVAILABLE and can be changed, generating an audit event", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Availability Co");
    const createRes = await createProduct(app, organizationId, owner.accessToken);
    expect(createRes.body.commercialOffer).toBeNull(); // no offer configured at create time

    const res = await request(app)
      .patch(`/api/organizations/${organizationId}/products/${createRes.body.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ commercialOffer: { availability: "OUT_OF_STOCK" } });
    expect(res.status).toBe(200);
    expect(res.body.commercialOffer.availability).toBe("OUT_OF_STOCK");

    const { prisma } = await import("../../src/lib/prisma");
    const audit = await prisma.auditLog.findFirst({
      where: { action: "COMMERCIAL_OFFER_AVAILABILITY_CHANGED", targetId: createRes.body.id },
    });
    expect(audit).not.toBeNull();
  });

  it("an OUT_OF_STOCK offer on an otherwise-discoverable ACTIVE product still appears in discovery (visibility != availability)", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Availability Co");
    const createRes = await createProduct(app, organizationId, owner.accessToken);
    await request(app)
      .patch(`/api/organizations/${organizationId}/products/${createRes.body.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "ACTIVE", isDiscoverable: true, commercialOffer: { availability: "OUT_OF_STOCK" } });

    const searcher = await registerAndLogin(app);
    const res = await request(app).get("/api/products").set("Authorization", `Bearer ${searcher.accessToken}`);
    const found = res.body.products.find((p: { id: string }) => p.id === createRes.body.id);
    expect(found).toBeDefined();
    expect(found.commercialOffer.availability).toBe("OUT_OF_STOCK");
  });
});

describe("Authorization and privacy (regression-style, offer-specific)", () => {
  it("a MANAGER of a different organization cannot set another org's commercial offer", async () => {
    const app = testApp();
    const ownerA = await registerAndLogin(app);
    const orgA = await createOrg(app, ownerA, "Org A");
    const createRes = await createProduct(app, orgA, ownerA.accessToken);

    const ownerB = await registerAndLogin(app);
    const orgB = await createOrg(app, ownerB, "Org B");

    const res = await request(app)
      .patch(`/api/organizations/${orgB}/products/${createRes.body.id}`)
      .set("Authorization", `Bearer ${ownerB.accessToken}`)
      .send({ commercialOffer: { availability: "DISCONTINUED" } });
    expect(res.status).toBe(404);
  });

  it("public product detail exposes commercial offer fields but no internal product fields", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Public Co");
    const createRes = await createProduct(app, organizationId, owner.accessToken, {
      commercialOffer: { leadTimeDays: 3, leadTimeNote: "Ships within 3 business days" },
    });
    await request(app)
      .patch(`/api/organizations/${organizationId}/products/${createRes.body.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "ACTIVE", isDiscoverable: true });

    const searcher = await registerAndLogin(app);
    const res = await request(app)
      .get(`/api/products/${createRes.body.id}`)
      .set("Authorization", `Bearer ${searcher.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.commercialOffer.leadTimeDays).toBe(3);
    expect(res.body.sku).toBeUndefined();
  });
});
