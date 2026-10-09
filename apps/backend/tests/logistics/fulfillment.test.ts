import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { createOrderForNewBuyer, createSeller, createSellableProduct } from "../commerce/helpers";
import { registerAndLogin, testApp } from "../helpers";
import { createConfirmedOrder } from "./helpers";

describe("Fulfillment — order eligibility", () => {
  it("rejects creating a fulfillment for a PENDING (unconfirmed) order", async () => {
    const app = testApp();
    const { seller, order } = await createOrderForNewBuyer(app);

    const res = await request(app)
      .post(`/api/orders/${order.id}/fulfillment`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`);

    expect(res.status).toBe(409);
    expect(await prisma.fulfillment.count()).toBe(0);
  });

  it("allows creating a fulfillment once the order is CONFIRMED, with no payment ever attempted", async () => {
    const app = testApp();
    const { seller, order } = await createConfirmedOrder(app, { quantity: 3 });

    const res = await request(app)
      .post(`/api/orders/${order.id}/fulfillment`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`);

    expect(res.status).toBe(201);
    expect(res.body.fulfillment.status).toBe("READY");
    expect(res.body.fulfillment.items).toHaveLength(1);
    expect(res.body.fulfillment.items[0].quantity).toBe(3);
  });

  it("blocks fulfillment when a payment was attempted and failed, with no successful payment on the order", async () => {
    const app = testApp();
    const { seller, order } = await createConfirmedOrder(app);
    await prisma.payment.create({
      data: {
        orderId: order.id,
        buyerUserId: (await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { buyerUserId: true } })).buyerUserId,
        provider: "PAYSTACK",
        status: "FAILED",
        amountMinor: order.totalMinor,
        currency: "NGN",
        reference: "ph_fulfillment_blocked",
      },
    });

    const res = await request(app)
      .post(`/api/orders/${order.id}/fulfillment`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`);

    expect(res.status).toBe(409);
  });

  it("allows fulfillment once one of the order's payments succeeded, even if an earlier attempt failed", async () => {
    const app = testApp();
    const { seller, order } = await createConfirmedOrder(app);
    const buyerUserId = (await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { buyerUserId: true } })).buyerUserId;
    await prisma.payment.create({
      data: { orderId: order.id, buyerUserId, provider: "PAYSTACK", status: "FAILED", amountMinor: order.totalMinor, currency: "NGN", reference: "ph_f1" },
    });
    await prisma.payment.create({
      data: { orderId: order.id, buyerUserId, provider: "PAYSTACK", status: "SUCCESS", amountMinor: order.totalMinor, currency: "NGN", reference: "ph_f2" },
    });

    const res = await request(app)
      .post(`/api/orders/${order.id}/fulfillment`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`);

    expect(res.status).toBe(201);
  });
});

describe("Fulfillment — duplicate prevention", () => {
  it("rejects a second fulfillment for an order that already has one", async () => {
    const app = testApp();
    const { seller, order } = await createConfirmedOrder(app);
    await request(app).post(`/api/orders/${order.id}/fulfillment`).set("Authorization", `Bearer ${seller.owner.accessToken}`);

    const res = await request(app)
      .post(`/api/orders/${order.id}/fulfillment`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`);

    expect(res.status).toBe(409);
    expect(await prisma.fulfillment.count()).toBe(1);
  });
});

describe("Fulfillment — authorization and organization isolation", () => {
  it("denies a STAFF member from creating a fulfillment (MANAGER+ only)", async () => {
    const app = testApp();
    const { seller, order } = await createConfirmedOrder(app);
    const staff = await registerAndLogin(app);
    await prisma.organizationMembership.create({ data: { organizationId: seller.organizationId, userId: staff.userId, role: "STAFF" } });

    const res = await request(app).post(`/api/orders/${order.id}/fulfillment`).set("Authorization", `Bearer ${staff.accessToken}`);

    // Reached via the order-scoped route, not /organizations/:id/..., so
    // insufficient role 404s the same way assertSellerAccess does
    // elsewhere — identical to "not a party at all" (anti-enumeration).
    expect(res.status).toBe(404);
  });

  it("denies the buyer from creating a fulfillment", async () => {
    const app = testApp();
    const { buyer, order } = await createConfirmedOrder(app);

    const res = await request(app).post(`/api/orders/${order.id}/fulfillment`).set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("denies a member of a different organization — 404, not 403 (anti-enumeration)", async () => {
    const app = testApp();
    const { order } = await createConfirmedOrder(app);
    const otherSeller = await createSeller(app);

    const res = await request(app)
      .post(`/api/orders/${order.id}/fulfillment`)
      .set("Authorization", `Bearer ${otherSeller.owner.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("lets the buyer view (read-only) but a cross-org stranger gets 404", async () => {
    const app = testApp();
    const { buyer, seller, order } = await createConfirmedOrder(app);
    const createRes = await request(app).post(`/api/orders/${order.id}/fulfillment`).set("Authorization", `Bearer ${seller.owner.accessToken}`);
    const fulfillmentId = createRes.body.fulfillment.id;

    const buyerView = await request(app).get(`/api/fulfillments/${fulfillmentId}`).set("Authorization", `Bearer ${buyer.accessToken}`);
    expect(buyerView.status).toBe(200);
    expect(buyerView.body.fulfillment.viewerRole).toBe("buyer");

    const stranger = await registerAndLogin(app);
    const strangerView = await request(app).get(`/api/fulfillments/${fulfillmentId}`).set("Authorization", `Bearer ${stranger.accessToken}`);
    expect(strangerView.status).toBe(404);
  });
});

describe("Fulfillment — state transitions", () => {
  it("walks READY -> PROCESSING -> PACKED -> DISPATCHED, recording timestamps and audit events", async () => {
    const app = testApp();
    const { seller, order } = await createConfirmedOrder(app);
    const createRes = await request(app).post(`/api/orders/${order.id}/fulfillment`).set("Authorization", `Bearer ${seller.owner.accessToken}`);
    const fulfillmentId = createRes.body.fulfillment.id;
    const token = `Bearer ${seller.owner.accessToken}`;

    const processing = await request(app).post(`/api/fulfillments/${fulfillmentId}/start-processing`).set("Authorization", token);
    expect(processing.status).toBe(200);
    expect(processing.body.fulfillment.status).toBe("PROCESSING");

    const packed = await request(app).post(`/api/fulfillments/${fulfillmentId}/pack`).set("Authorization", token);
    expect(packed.status).toBe(200);
    expect(packed.body.fulfillment.status).toBe("PACKED");
    expect(packed.body.fulfillment.packedAt).not.toBeNull();

    const dispatched = await request(app)
      .post(`/api/fulfillments/${fulfillmentId}/dispatch`)
      .set("Authorization", token)
      .send({ recipientName: "Jane", recipientPhone: "+234800", destinationAddressLine: "1 Street", destinationCity: "Lagos", destinationCountry: "Nigeria" });
    expect(dispatched.status).toBe(200);
    expect(dispatched.body.fulfillment.status).toBe("DISPATCHED");
    expect(dispatched.body.fulfillment.delivery).not.toBeNull();

    const auditActions = (await prisma.auditLog.findMany({ where: { targetId: fulfillmentId } })).map((a) => a.action);
    expect(auditActions).toContain("FULFILLMENT_CREATED");
    expect(auditActions).toContain("FULFILLMENT_PROCESSING_STARTED");
    expect(auditActions).toContain("FULFILLMENT_PACKED");
    expect(auditActions).toContain("FULFILLMENT_DISPATCHED");
  });

  it("rejects an invalid transition — skipping straight from READY to DISPATCHED", async () => {
    const app = testApp();
    const { seller, order } = await createConfirmedOrder(app);
    const createRes = await request(app).post(`/api/orders/${order.id}/fulfillment`).set("Authorization", `Bearer ${seller.owner.accessToken}`);
    const fulfillmentId = createRes.body.fulfillment.id;

    const res = await request(app)
      .post(`/api/fulfillments/${fulfillmentId}/dispatch`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`)
      .send({ recipientName: "Jane", recipientPhone: "+234800", destinationAddressLine: "1 Street", destinationCity: "Lagos", destinationCountry: "Nigeria" });

    expect(res.status).toBe(409);
    expect(await prisma.delivery.count()).toBe(0);
  });

  it("marks an exception from PROCESSING and records the reason", async () => {
    const app = testApp();
    const { seller, order } = await createConfirmedOrder(app);
    const createRes = await request(app).post(`/api/orders/${order.id}/fulfillment`).set("Authorization", `Bearer ${seller.owner.accessToken}`);
    const fulfillmentId = createRes.body.fulfillment.id;
    const token = `Bearer ${seller.owner.accessToken}`;
    await request(app).post(`/api/fulfillments/${fulfillmentId}/start-processing`).set("Authorization", token);

    const res = await request(app)
      .post(`/api/fulfillments/${fulfillmentId}/exception`)
      .set("Authorization", token)
      .send({ reason: "Stock damaged during packing" });

    expect(res.status).toBe(200);
    expect(res.body.fulfillment.status).toBe("EXCEPTION");
    expect(res.body.fulfillment.exceptionReason).toBe("Stock damaged during packing");

    // Terminal — no further transitions allowed.
    const retry = await request(app).post(`/api/fulfillments/${fulfillmentId}/pack`).set("Authorization", token);
    expect(retry.status).toBe(409);
  });
});

describe("Fulfillment — inventory relationship", () => {
  it("consumes the checkout reservation into a finalized sale when fulfillment is created for a tracked product, with no prior payment", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId, { unitPriceMinor: 1000 });
    const inventory = await prisma.inventory.create({ data: { organizationId: seller.organizationId, productId, onHand: 20, reserved: 0 } });

    const buyer = await registerAndLogin(app);
    await request(app).post("/api/cart/items").set("Authorization", `Bearer ${buyer.accessToken}`).send({ productId, quantity: 5 });
    const checkoutRes = await request(app).post("/api/checkout").set("Authorization", `Bearer ${buyer.accessToken}`);
    const orderId = checkoutRes.body.orders[0].id;
    await request(app).post(`/api/orders/${orderId}/confirm`).set("Authorization", `Bearer ${seller.owner.accessToken}`);

    const afterReserve = await prisma.inventory.findUniqueOrThrow({ where: { id: inventory.id } });
    expect(afterReserve.onHand).toBe(20);
    expect(afterReserve.reserved).toBe(5);

    const res = await request(app).post(`/api/orders/${orderId}/fulfillment`).set("Authorization", `Bearer ${seller.owner.accessToken}`);
    expect(res.status).toBe(201);

    const afterFulfillment = await prisma.inventory.findUniqueOrThrow({ where: { id: inventory.id } });
    expect(afterFulfillment.onHand).toBe(15);
    expect(afterFulfillment.reserved).toBe(0);
    const sale = await prisma.stockMovement.findMany({ where: { inventoryId: inventory.id, type: "SALE" } });
    expect(sale).toHaveLength(1);
  });

  it("never double-consumes stock when a successful payment already finalized the sale before fulfillment is created", async () => {
    const app = testApp();
    const seller = await createSeller(app);
    const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId, { unitPriceMinor: 1000 });
    const inventory = await prisma.inventory.create({ data: { organizationId: seller.organizationId, productId, onHand: 20, reserved: 0 } });

    const buyer = await registerAndLogin(app);
    await request(app).post("/api/cart/items").set("Authorization", `Bearer ${buyer.accessToken}`).send({ productId, quantity: 5 });
    const checkoutRes = await request(app).post("/api/checkout").set("Authorization", `Bearer ${buyer.accessToken}`);
    const orderId = checkoutRes.body.orders[0].id;
    await request(app).post(`/api/orders/${orderId}/confirm`).set("Authorization", `Bearer ${seller.owner.accessToken}`);

    const payment = await prisma.payment.create({
      data: { orderId, buyerUserId: buyer.userId, provider: "PAYSTACK", status: "PENDING", amountMinor: checkoutRes.body.orders[0].totalMinor, currency: "NGN", reference: "ph_double_consume" },
    });
    const { createHmac } = await import("crypto");
    const { env } = await import("../../src/config/env");
    const body = JSON.stringify({ event: "charge.success", data: { reference: payment.reference, amount: payment.amountMinor, currency: payment.currency, status: "success", id: 1 } });
    const signature = createHmac("sha512", env.PAYSTACK_SECRET_KEY!).update(body).digest("hex");
    await request(app).post("/api/payments/webhook/paystack").set("Content-Type", "application/json").set("x-paystack-signature", signature).send(body);

    const afterPayment = await prisma.inventory.findUniqueOrThrow({ where: { id: inventory.id } });
    expect(afterPayment.onHand).toBe(15);
    expect(afterPayment.reserved).toBe(0);

    const res = await request(app).post(`/api/orders/${orderId}/fulfillment`).set("Authorization", `Bearer ${seller.owner.accessToken}`);
    expect(res.status).toBe(201);

    const afterFulfillment = await prisma.inventory.findUniqueOrThrow({ where: { id: inventory.id } });
    expect(afterFulfillment.onHand).toBe(15); // unchanged — not deducted a second time
    expect(afterFulfillment.reserved).toBe(0);
    const sales = await prisma.stockMovement.findMany({ where: { inventoryId: inventory.id, type: "SALE" } });
    expect(sales).toHaveLength(1); // still exactly one SALE movement, not two
  });
});
