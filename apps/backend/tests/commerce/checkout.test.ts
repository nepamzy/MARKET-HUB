import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { registerAndLogin, testApp } from "../helpers";
import { createSeller, createSellableProduct } from "./helpers";

describe("Checkout", () => {
  it("rejects checkout on an empty cart", async () => {
    const app = testApp();
    const buyer = await registerAndLogin(app);

    const res = await request(app).post("/api/checkout").set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(400);
  });

  it("creates an order from a valid single-seller cart, with correct items and totals", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId, {
      unitPriceMinor: 2500,
      currency: "NGN",
    });
    const buyer = await registerAndLogin(app);
    await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ productId, quantity: 4 });

    const res = await request(app).post("/api/checkout").set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(201);
    expect(res.body.orders).toHaveLength(1);
    const order = res.body.orders[0];
    expect(order.status).toBe("PENDING");
    expect(order.currency).toBe("NGN");
    expect(order.subtotalMinor).toBe(10000);
    expect(order.totalMinor).toBe(10000);
    expect(order.totalQuantity).toBe(4);
    expect(order.items).toHaveLength(1);
    expect(order.items[0].quantity).toBe(4);
    expect(order.items[0].unitPriceMinor).toBe(2500);
    expect(order.items[0].lineTotalMinor).toBe(10000);
  });

  it("decomposes a multi-seller cart into one independent order per seller", async () => {
    const app = testApp();
    const sellerA = await createSeller(app);
    const sellerB = await createSeller(app);
    const productA = await createSellableProduct(app, sellerA.owner.accessToken, sellerA.organizationId, { unitPriceMinor: 1000 });
    const productB = await createSellableProduct(app, sellerB.owner.accessToken, sellerB.organizationId, { unitPriceMinor: 2000 });
    const buyer = await registerAndLogin(app);
    await request(app).post("/api/cart/items").set("Authorization", `Bearer ${buyer.accessToken}`).send({ productId: productA, quantity: 1 });
    await request(app).post("/api/cart/items").set("Authorization", `Bearer ${buyer.accessToken}`).send({ productId: productB, quantity: 1 });

    const res = await request(app).post("/api/checkout").set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(201);
    expect(res.body.orders).toHaveLength(2);
    const sellerIds = res.body.orders.map((o: { sellerOrganizationId: string }) => o.sellerOrganizationId).sort();
    expect(sellerIds).toEqual([sellerA.organizationId, sellerB.organizationId].sort());
  });

  it("never mixes currencies in one order — same seller, two currencies, produces two orders", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    const productNgn = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId, {
      name: "NGN Product",
      unitPriceMinor: 1000,
      currency: "NGN",
    });
    const productKes = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId, {
      name: "KES Product",
      unitPriceMinor: 500,
      currency: "KES",
    });
    const buyer = await registerAndLogin(app);
    await request(app).post("/api/cart/items").set("Authorization", `Bearer ${buyer.accessToken}`).send({ productId: productNgn, quantity: 1 });
    await request(app).post("/api/cart/items").set("Authorization", `Bearer ${buyer.accessToken}`).send({ productId: productKes, quantity: 1 });

    const res = await request(app).post("/api/checkout").set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(201);
    expect(res.body.orders).toHaveLength(2);
    const currencies = res.body.orders.map((o: { currency: string }) => o.currency).sort();
    expect(currencies).toEqual(["KES", "NGN"]);
  });

  it("clears the cart after checkout and starts a fresh one", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId);
    const buyer = await registerAndLogin(app);
    await request(app).post("/api/cart/items").set("Authorization", `Bearer ${buyer.accessToken}`).send({ productId, quantity: 1 });
    await request(app).post("/api/checkout").set("Authorization", `Bearer ${buyer.accessToken}`);

    const res = await request(app).get("/api/cart").set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("fails the whole checkout (creates no orders) if any cart item has gone invalid since being added", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    const goodProduct = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId);
    const badProduct = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId, { name: "Will be discontinued" });
    const buyer = await registerAndLogin(app);
    await request(app).post("/api/cart/items").set("Authorization", `Bearer ${buyer.accessToken}`).send({ productId: goodProduct, quantity: 1 });
    await request(app).post("/api/cart/items").set("Authorization", `Bearer ${buyer.accessToken}`).send({ productId: badProduct, quantity: 1 });

    await request(app)
      .patch(`/api/organizations/${seller.organizationId}/products/${badProduct}`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`)
      .send({ commercialOffer: { availability: "DISCONTINUED" } });

    const ordersBefore = await prisma.order.count();
    const res = await request(app).post("/api/checkout").set("Authorization", `Bearer ${buyer.accessToken}`);
    const ordersAfter = await prisma.order.count();

    expect(res.status).toBe(400);
    expect(ordersAfter).toBe(ordersBefore);

    // The cart must still be intact (not partially consumed) after a
    // failed checkout.
    const cartRes = await request(app).get("/api/cart").set("Authorization", `Bearer ${buyer.accessToken}`);
    expect(cartRes.body.items).toHaveLength(2);
  });

  it("keeps an immutable snapshot — changing the product's name and price afterward does not change the historical order", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId, {
      name: "Original Name",
      unitPriceMinor: 1000,
    });
    const buyer = await registerAndLogin(app);
    await request(app).post("/api/cart/items").set("Authorization", `Bearer ${buyer.accessToken}`).send({ productId, quantity: 2 });
    const checkoutRes = await request(app).post("/api/checkout").set("Authorization", `Bearer ${buyer.accessToken}`);
    const orderId = checkoutRes.body.orders[0].id;

    await request(app)
      .patch(`/api/organizations/${seller.organizationId}/products/${productId}`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`)
      .send({ name: "Renamed Product", prices: [{ tier: "RETAIL", minQuantity: 1, unitPriceMinor: 9999, currency: "NGN" }] });

    const res = await request(app).get(`/api/orders/${orderId}`).set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.body.items[0].productName).toBe("Original Name");
    expect(res.body.items[0].unitPriceMinor).toBe(1000);
    expect(res.body.totalMinor).toBe(2000);
  });

  it("computes exact minor-unit totals with no floating-point drift across many items", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    // A price/quantity combination that is a classic float trap (0.1-style
    // repeating binary fractions) if ever computed as decimal arithmetic.
    const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId, { unitPriceMinor: 1099 });
    const buyer = await registerAndLogin(app);
    await request(app).post("/api/cart/items").set("Authorization", `Bearer ${buyer.accessToken}`).send({ productId, quantity: 7 });

    const res = await request(app).post("/api/checkout").set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.body.orders[0].totalMinor).toBe(1099 * 7);
    expect(Number.isInteger(res.body.orders[0].totalMinor)).toBe(true);
  });

  it("idempotency: two concurrent checkout requests for the same cart produce exactly one set of orders", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId);
    const buyer = await registerAndLogin(app);
    await request(app).post("/api/cart/items").set("Authorization", `Bearer ${buyer.accessToken}`).send({ productId, quantity: 1 });

    const ordersBefore = await prisma.order.count();

    const [a, b] = await Promise.all([
      request(app).post("/api/checkout").set("Authorization", `Bearer ${buyer.accessToken}`),
      request(app).post("/api/checkout").set("Authorization", `Bearer ${buyer.accessToken}`),
    ]);

    // Ascending numeric sort -- 201 is always the smallest of {201, 400, 409}
    // so it always lands at index 0, never index 1.
    const statuses = [a.status, b.status].sort((x, y) => x - y);
    // Exactly one wins the atomic claim and creates orders (201); the other
    // loses the race. Because the cart becomes empty once checked out, the
    // loser may see either "already checked out" (409, lost the exact race)
    // or "empty cart" (400, arrived just after the winner fully committed).
    expect(statuses[0]).toBe(201);
    expect([400, 409]).toContain(statuses[1]);

    const ordersAfter = await prisma.order.count();
    expect(ordersAfter - ordersBefore).toBe(1);
  });
});
