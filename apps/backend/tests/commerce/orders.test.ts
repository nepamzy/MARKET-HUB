import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { registerAndLogin, testApp } from "../helpers";
import { createSeller, createSellableProduct } from "./helpers";

async function placeOrder(app: ReturnType<typeof testApp>) {
  const seller = await createSeller(app);
  const productId = await createSellableProduct(app, seller.owner.accessToken, seller.organizationId);
  const buyer = await registerAndLogin(app);
  await request(app).post("/api/cart/items").set("Authorization", `Bearer ${buyer.accessToken}`).send({ productId, quantity: 2 });
  const checkoutRes = await request(app).post("/api/checkout").set("Authorization", `Bearer ${buyer.accessToken}`);
  return { seller, buyer, orderId: checkoutRes.body.orders[0].id as string };
}

describe("Order authorization and privacy", () => {
  it("lets the buyer view their own order", async () => {
    const app = testApp();
    const { buyer, orderId } = await placeOrder(app);

    const res = await request(app).get(`/api/orders/${orderId}`).set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(200);
  });

  it("lets a seller-org STAFF member view the order", async () => {
    const app = testApp();
    const { seller, orderId } = await placeOrder(app);

    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`);

    expect(res.status).toBe(200);
  });

  it("returns 404 (not 403) for an unrelated user — no enumeration signal", async () => {
    const app = testApp();
    const { orderId } = await placeOrder(app);
    const intruder = await registerAndLogin(app);

    const res = await request(app).get(`/api/orders/${orderId}`).set("Authorization", `Bearer ${intruder.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("returns 404 for an unrelated seller organization's member", async () => {
    const app = testApp();
    const { orderId } = await placeOrder(app);
    const otherSeller = await createSeller(app);

    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set("Authorization", `Bearer ${otherSeller.owner.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("a buyer's order list never includes another buyer's orders", async () => {
    const app = testApp();
    const { buyer: buyerA } = await placeOrder(app);
    const { orderId: orderBId } = await placeOrder(app);

    const res = await request(app).get("/api/orders").set("Authorization", `Bearer ${buyerA.accessToken}`);

    expect(res.body.orders.some((o: { id: string }) => o.id === orderBId)).toBe(false);
  });

  it("lets a seller org list its own orders via the organization-scoped endpoint", async () => {
    const app = testApp();
    const { seller, orderId } = await placeOrder(app);

    const res = await request(app)
      .get(`/api/organizations/${seller.organizationId}/orders`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.orders.some((o: { id: string }) => o.id === orderId)).toBe(true);
  });

  it("blocks a non-member from listing a seller organization's orders", async () => {
    const app = testApp();
    const { seller } = await placeOrder(app);
    const intruder = await registerAndLogin(app);

    const res = await request(app)
      .get(`/api/organizations/${seller.organizationId}/orders`)
      .set("Authorization", `Bearer ${intruder.accessToken}`);

    expect(res.status).toBe(403);
  });
});

describe("Order state machine", () => {
  it("walks the full valid path: PENDING -> CONFIRMED -> PROCESSING -> COMPLETED", async () => {
    const app = testApp();
    const { seller, orderId } = await placeOrder(app);
    const auth = { Authorization: `Bearer ${seller.owner.accessToken}` };

    const confirm = await request(app).post(`/api/orders/${orderId}/confirm`).set(auth);
    expect(confirm.status).toBe(200);
    expect(confirm.body.status).toBe("CONFIRMED");

    const processing = await request(app).post(`/api/orders/${orderId}/start-processing`).set(auth);
    expect(processing.status).toBe(200);
    expect(processing.body.status).toBe("PROCESSING");

    const completed = await request(app).post(`/api/orders/${orderId}/complete`).set(auth);
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe("COMPLETED");
  });

  it("rejects skipping a state (PENDING -> PROCESSING directly)", async () => {
    const app = testApp();
    const { seller, orderId } = await placeOrder(app);

    const res = await request(app)
      .post(`/api/orders/${orderId}/start-processing`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`);

    expect(res.status).toBe(409);
  });

  it("rejects any transition out of a terminal state (COMPLETED)", async () => {
    const app = testApp();
    const { seller, orderId } = await placeOrder(app);
    const auth = { Authorization: `Bearer ${seller.owner.accessToken}` };
    await request(app).post(`/api/orders/${orderId}/confirm`).set(auth);
    await request(app).post(`/api/orders/${orderId}/start-processing`).set(auth);
    await request(app).post(`/api/orders/${orderId}/complete`).set(auth);

    const res = await request(app).post(`/api/orders/${orderId}/cancel`).set(auth).send({});

    expect(res.status).toBe(409);
  });

  it("there is no route to assign an arbitrary status directly", async () => {
    const app = testApp();
    const { seller, orderId } = await placeOrder(app);

    const res = await request(app)
      .patch(`/api/orders/${orderId}`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`)
      .send({ status: "COMPLETED" });

    // No such route exists at all.
    expect(res.status).toBe(404);
  });

  it("blocks a buyer from performing seller-only transitions", async () => {
    const app = testApp();
    const { buyer, orderId } = await placeOrder(app);

    const res = await request(app)
      .post(`/api/orders/${orderId}/confirm`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    // 404, not 403 — identical to "not your order" (this endpoint is
    // seller-only; a buyer is simply not a party with access to it).
    expect(res.status).toBe(404);
  });

  it("blocks a seller STAFF member (below MANAGER) from confirming an order", async () => {
    const app = testApp();
    const { seller, orderId } = await placeOrder(app);
    const staff = await registerAndLogin(app);
    await request(app)
      .post(`/api/organizations/${seller.organizationId}/members`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`)
      .send({ email: staff.email, role: "STAFF" });

    const res = await request(app).post(`/api/orders/${orderId}/confirm`).set("Authorization", `Bearer ${staff.accessToken}`);

    expect(res.status).toBe(404);
  });
});

describe("Cancellation", () => {
  it("lets the buyer cancel a PENDING order", async () => {
    const app = testApp();
    const { buyer, orderId } = await placeOrder(app);

    const res = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ reason: "Changed my mind" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CANCELLED");
    expect(res.body.cancelReason).toBe("Changed my mind");
  });

  it("lets a seller MANAGER cancel a CONFIRMED order", async () => {
    const app = testApp();
    const { seller, orderId } = await placeOrder(app);
    await request(app).post(`/api/orders/${orderId}/confirm`).set("Authorization", `Bearer ${seller.owner.accessToken}`);

    const res = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CANCELLED");
  });

  it("rejects cancellation once an order is PROCESSING", async () => {
    const app = testApp();
    const { seller, orderId } = await placeOrder(app);
    const auth = { Authorization: `Bearer ${seller.owner.accessToken}` };
    await request(app).post(`/api/orders/${orderId}/confirm`).set(auth);
    await request(app).post(`/api/orders/${orderId}/start-processing`).set(auth);

    const res = await request(app).post(`/api/orders/${orderId}/cancel`).set(auth).send({});

    expect(res.status).toBe(409);
  });

  it("rejects cancellation by an unrelated user", async () => {
    const app = testApp();
    const { orderId } = await placeOrder(app);
    const intruder = await registerAndLogin(app);

    const res = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set("Authorization", `Bearer ${intruder.accessToken}`)
      .send({});

    expect(res.status).toBe(404);
  });

  it("retains the order record after cancellation — it is never deleted", async () => {
    const app = testApp();
    const { buyer, orderId } = await placeOrder(app);
    await request(app).post(`/api/orders/${orderId}/cancel`).set("Authorization", `Bearer ${buyer.accessToken}`).send({});

    const stored = await prisma.order.findUnique({ where: { id: orderId } });
    expect(stored).not.toBeNull();
    expect(stored!.status).toBe("CANCELLED");

    const res = await request(app).get(`/api/orders/${orderId}`).set("Authorization", `Bearer ${buyer.accessToken}`);
    expect(res.status).toBe(200);
  });

  it("records an ORDER_CANCELLED audit event", async () => {
    const app = testApp();
    const { buyer, seller, orderId } = await placeOrder(app);
    await request(app).post(`/api/orders/${orderId}/cancel`).set("Authorization", `Bearer ${buyer.accessToken}`).send({});

    const audit = await prisma.auditLog.findFirst({
      where: { action: "ORDER_CANCELLED", targetId: orderId, organizationId: seller.organizationId },
    });
    expect(audit).not.toBeNull();
  });

  it("records an ORDER_CREATED audit event at checkout", async () => {
    const app = testApp();
    const { seller, orderId } = await placeOrder(app);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "ORDER_CREATED", targetId: orderId, organizationId: seller.organizationId },
    });
    expect(audit).not.toBeNull();
  });
});
