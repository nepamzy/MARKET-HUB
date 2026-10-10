import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerAndLogin, testApp } from "../helpers";
import { createSeller, createSellableProduct } from "./helpers";

describe("Cart — create/retrieve and item management", () => {
  it("creates an empty cart on first access", async () => {
    const app = testApp();
    const buyer = await registerAndLogin(app);

    const res = await request(app).get("/api/cart").set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.totalQuantity).toBe(0);
  });

  it("rejects an unauthenticated request", async () => {
    const app = testApp();
    const res = await request(app).get("/api/cart");
    expect(res.status).toBe(401);
  });

  it("adds an item and resolves the authoritative price server-side", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId, {
      unitPriceMinor: 1500,
      currency: "NGN",
    });
    const buyer = await registerAndLogin(app);

    const res = await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ productId, quantity: 3 });

    expect(res.status).toBe(201);
    const item = res.body.items[0];
    expect(item.valid).toBe(true);
    expect(item.unitPriceMinor).toBe(1500);
    expect(item.lineTotalMinor).toBe(4500);
    expect(item.currency).toBe("NGN");
    expect(res.body.subtotalByCurrency.NGN).toBe(4500);
  });

  it("ignores any price the client tries to submit — only productId and quantity are accepted", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId, {
      unitPriceMinor: 1500,
    });
    const buyer = await registerAndLogin(app);

    const res = await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ productId, quantity: 2, unitPriceMinor: 1, totalMinor: 1 });

    expect(res.status).toBe(201);
    expect(res.body.items[0].unitPriceMinor).toBe(1500);
    expect(res.body.items[0].lineTotalMinor).toBe(3000);
  });

  it("updates quantity on an existing line rather than duplicating it", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId);
    const buyer = await registerAndLogin(app);
    await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ productId, quantity: 2 });

    const res = await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ productId, quantity: 3 });

    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].quantity).toBe(5);
  });

  it("updates an item's quantity via PATCH", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId);
    const buyer = await registerAndLogin(app);
    const addRes = await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ productId, quantity: 2 });
    const itemId = addRes.body.items[0].id;

    const res = await request(app)
      .patch(`/api/cart/items/${itemId}`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ quantity: 7 });

    expect(res.status).toBe(200);
    expect(res.body.items[0].quantity).toBe(7);
  });

  it("removes an item", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId);
    const buyer = await registerAndLogin(app);
    const addRes = await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ productId, quantity: 2 });
    const itemId = addRes.body.items[0].id;

    const res = await request(app)
      .delete(`/api/cart/items/${itemId}`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("clears the whole cart", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId);
    const buyer = await registerAndLogin(app);
    await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ productId, quantity: 2 });

    const res = await request(app).delete("/api/cart").set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("a user cannot modify another user's cart item", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId);
    const buyer = await registerAndLogin(app);
    const addRes = await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ productId, quantity: 2 });
    const itemId = addRes.body.items[0].id;

    const intruder = await registerAndLogin(app);
    const res = await request(app)
      .patch(`/api/cart/items/${itemId}`)
      .set("Authorization", `Bearer ${intruder.accessToken}`)
      .send({ quantity: 99 });

    expect(res.status).toBe(404);
  });
});

describe("Cart — quantity and availability validation", () => {
  it("rejects a quantity below the minimum order quantity", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId, {
      minimumOrderQuantity: 10,
    });
    const buyer = await registerAndLogin(app);

    const res = await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ productId, quantity: 5 });

    expect(res.status).toBe(400);
  });

  it("rejects a quantity above the maximum", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId, {
      maxQuantity: 20,
    });
    const buyer = await registerAndLogin(app);

    const res = await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ productId, quantity: 25 });

    expect(res.status).toBe(400);
  });

  it("rejects a quantity that isn't a multiple of the order increment", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId, {
      orderIncrement: 5,
    });
    const buyer = await registerAndLogin(app);

    const res = await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ productId, quantity: 7 });

    expect(res.status).toBe(400);
  });

  it("rejects adding an item whose offer is not AVAILABLE", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId, {
      availability: "OUT_OF_STOCK",
    });
    const buyer = await registerAndLogin(app);

    const res = await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ productId, quantity: 1 });

    expect(res.status).toBe(400);
  });

  it("resolves the correct quantity-breakpoint price tier", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId, {
      unitPriceMinor: 1000,
      extraPrices: [{ tier: "RETAIL", minQuantity: 10, unitPriceMinor: 800, currency: "NGN" }],
    });
    const buyer = await registerAndLogin(app);

    const smallQty = await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ productId, quantity: 5 });
    expect(smallQty.body.items[0].unitPriceMinor).toBe(1000);

    await request(app).delete("/api/cart").set("Authorization", `Bearer ${buyer.accessToken}`);

    const largeQty = await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ productId, quantity: 10 });
    expect(largeQty.body.items[0].unitPriceMinor).toBe(800);
  });

  it("flags an item as invalid (without crashing the whole cart view) once it becomes unavailable after being added", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId);
    const buyer = await registerAndLogin(app);
    await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ productId, quantity: 2 });

    await request(app)
      .patch(`/api/organizations/${seller.organizationId}/products/${productId}`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`)
      .send({ commercialOffer: { availability: "DISCONTINUED" } });

    const res = await request(app).get("/api/cart").set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items[0].valid).toBe(false);
    expect(res.body.subtotalByCurrency).toEqual({});
  });
});
