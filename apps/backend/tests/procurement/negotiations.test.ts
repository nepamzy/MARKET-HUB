import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { registerAndLogin, testApp } from "../helpers";
import { createBuyer, createIssuedRfq, createSubmittedRequisition, createSubmittedResponse, createSupplier } from "./helpers";

async function setUp(app: ReturnType<typeof testApp>) {
  const buyer = await createBuyer(app);
  const supplier = await createSupplier(app);
  const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
  const { rfqId, items } = await createIssuedRfq(app, buyer.owner.accessToken, buyer.organizationId, requisitionId, [
    supplier.organizationId,
  ]);
  const rfqItemId = items[0]!.id;
  const { responseId } = await createSubmittedResponse(app, supplier.owner.accessToken, supplier.organizationId, rfqId, rfqItemId, 150000);
  return { buyer, supplier, rfqId, rfqItemId, responseId };
}

function counterPayload(rfqItemId: string, unitPriceMinor: number) {
  return { items: [{ rfqItemId, quantity: 100, unit: "PIECE", unitPriceMinor, currency: "NGN" }] };
}

describe("Negotiation", () => {
  it("lets the authorized buyer open a negotiation with an initial counter-offer", async () => {
    const app = testApp();
    const { buyer, rfqId, rfqItemId, responseId } = await setUp(app);

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/negotiations`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId, message: "Can you do better on price?", ...counterPayload(rfqItemId, 140000) });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("OPEN");
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].authorRole).toBe("BUYER");
    expect(res.body.events[0].items[0].unitPriceMinor).toBe(140000);
  });

  it("rejects opening a second negotiation for the same response — duplicate creation handled safely", async () => {
    const app = testApp();
    const { buyer, rfqId, rfqItemId, responseId } = await setUp(app);
    await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/negotiations`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId, ...counterPayload(rfqItemId, 140000) });

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/negotiations`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId, ...counterPayload(rfqItemId, 130000) });

    expect(res.status).toBe(409);
    const count = await prisma.negotiation.count({ where: { responseId } });
    expect(count).toBe(1);
  });

  it("rejects a STAFF-level buyer member opening a negotiation — wrong-side/insufficient-role actor cannot act", async () => {
    const app = testApp();
    const { buyer, rfqId, rfqItemId, responseId } = await setUp(app);
    const staffUser = await registerAndLogin(app);
    await request(app)
      .post(`/api/organizations/${buyer.organizationId}/members`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ email: staffUser.email, role: "STAFF" });

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/negotiations`)
      .set("Authorization", `Bearer ${staffUser.accessToken}`)
      .send({ responseId, ...counterPayload(rfqItemId, 140000) });

    expect(res.status).toBe(403);
  });

  it("the targeted supplier can respond to an open negotiation with a counter-offer", async () => {
    const app = testApp();
    const { buyer, supplier, rfqId, rfqItemId, responseId } = await setUp(app);
    const openRes = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/negotiations`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId, ...counterPayload(rfqItemId, 140000) });
    const negotiationId = openRes.body.id as string;

    const res = await request(app)
      .post(`/api/negotiations/${negotiationId}/respond`)
      .set("Authorization", `Bearer ${supplier.owner.accessToken}`)
      .send({ decision: "COUNTER", ...counterPayload(rfqItemId, 145000) });

    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(2);
    expect(res.body.events[1].authorRole).toBe("SUPPLIER");
    expect(res.body.events[1].items[0].unitPriceMinor).toBe(145000);
  });

  it("preserves historical offers — earlier events remain unchanged after a new counter-offer", async () => {
    const app = testApp();
    const { buyer, supplier, rfqId, rfqItemId, responseId } = await setUp(app);
    const openRes = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/negotiations`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId, ...counterPayload(rfqItemId, 140000) });
    const negotiationId = openRes.body.id as string;

    await request(app)
      .post(`/api/negotiations/${negotiationId}/respond`)
      .set("Authorization", `Bearer ${supplier.owner.accessToken}`)
      .send({ decision: "COUNTER", ...counterPayload(rfqItemId, 145000) });

    // The original SupplierResponse itself is untouched by negotiation.
    const originalResponse = await prisma.supplierResponseItem.findFirst({ where: { responseId } });
    expect(originalResponse?.unitPriceMinor).toBe(150000);

    const detail = await request(app)
      .get(`/api/negotiations/${negotiationId}`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);
    expect(detail.body.events[0].items[0].unitPriceMinor).toBe(140000);
    expect(detail.body.events[1].items[0].unitPriceMinor).toBe(145000);
  });

  it("rejects the same side countering twice in a row — it is not your turn", async () => {
    const app = testApp();
    const { buyer, rfqId, rfqItemId, responseId } = await setUp(app);
    const openRes = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/negotiations`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId, ...counterPayload(rfqItemId, 140000) });
    const negotiationId = openRes.body.id as string;

    const res = await request(app)
      .post(`/api/negotiations/${negotiationId}/respond`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ decision: "COUNTER", ...counterPayload(rfqItemId, 135000) });

    expect(res.status).toBe(409);
  });

  it("lets a side accept the negotiation, closing it as ACCEPTED", async () => {
    const app = testApp();
    const { buyer, supplier, rfqId, rfqItemId, responseId } = await setUp(app);
    const openRes = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/negotiations`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId, ...counterPayload(rfqItemId, 140000) });
    const negotiationId = openRes.body.id as string;

    const res = await request(app)
      .post(`/api/negotiations/${negotiationId}/respond`)
      .set("Authorization", `Bearer ${supplier.owner.accessToken}`)
      .send({ decision: "ACCEPT" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ACCEPTED");
  });

  it("lets a side decline, closing it as CLOSED", async () => {
    const app = testApp();
    const { buyer, supplier, rfqId, rfqItemId, responseId } = await setUp(app);
    const openRes = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/negotiations`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId, ...counterPayload(rfqItemId, 140000) });
    const negotiationId = openRes.body.id as string;

    const res = await request(app)
      .post(`/api/negotiations/${negotiationId}/respond`)
      .set("Authorization", `Bearer ${supplier.owner.accessToken}`)
      .send({ decision: "DECLINE", message: "No longer interested" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CLOSED");
  });

  it("rejects responding to an already-terminal negotiation — invalid transition", async () => {
    const app = testApp();
    const { buyer, supplier, rfqId, rfqItemId, responseId } = await setUp(app);
    const openRes = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/negotiations`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId, ...counterPayload(rfqItemId, 140000) });
    const negotiationId = openRes.body.id as string;
    await request(app)
      .post(`/api/negotiations/${negotiationId}/respond`)
      .set("Authorization", `Bearer ${supplier.owner.accessToken}`)
      .send({ decision: "ACCEPT" });

    const res = await request(app)
      .post(`/api/negotiations/${negotiationId}/respond`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ decision: "DECLINE" });

    expect(res.status).toBe(409);
  });

  it("returns 404 (not 403) for an unrelated organization — no enumeration", async () => {
    const app = testApp();
    const { buyer, rfqId, rfqItemId, responseId } = await setUp(app);
    const openRes = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/negotiations`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId, ...counterPayload(rfqItemId, 140000) });
    const negotiationId = openRes.body.id as string;
    const stranger = await registerAndLogin(app);

    const getRes = await request(app).get(`/api/negotiations/${negotiationId}`).set("Authorization", `Bearer ${stranger.accessToken}`);
    const respondRes = await request(app)
      .post(`/api/negotiations/${negotiationId}/respond`)
      .set("Authorization", `Bearer ${stranger.accessToken}`)
      .send({ decision: "ACCEPT" });

    expect(getRes.status).toBe(404);
    expect(respondRes.status).toBe(404);
  });

  it("returns 404 for a competing supplier organization unrelated to this negotiation", async () => {
    const app = testApp();
    const { buyer, rfqId, rfqItemId, responseId } = await setUp(app);
    const openRes = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/negotiations`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId, ...counterPayload(rfqItemId, 140000) });
    const negotiationId = openRes.body.id as string;
    const otherSupplier = await createSupplier(app);

    const res = await request(app)
      .get(`/api/negotiations/${negotiationId}`)
      .set("Authorization", `Bearer ${otherSupplier.owner.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("rejects a response item that does not map to a valid RFQ item", async () => {
    const app = testApp();
    const { buyer, rfqId, responseId } = await setUp(app);

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/negotiations`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId, ...counterPayload("00000000-0000-0000-0000-000000000000", 140000) });

    expect(res.status).toBe(400);
  });

  it("records NEGOTIATION_CREATED, COUNTER_OFFER_CREATED, and ACCEPTED audit events", async () => {
    const app = testApp();
    const { buyer, supplier, rfqId, rfqItemId, responseId } = await setUp(app);
    const openRes = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/negotiations`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId, ...counterPayload(rfqItemId, 140000) });
    const negotiationId = openRes.body.id as string;
    await request(app)
      .post(`/api/negotiations/${negotiationId}/respond`)
      .set("Authorization", `Bearer ${supplier.owner.accessToken}`)
      .send({ decision: "ACCEPT" });

    const logs = await prisma.auditLog.findMany({ where: { targetType: "Negotiation", targetId: negotiationId } });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain("NEGOTIATION_CREATED");
    expect(actions).toContain("NEGOTIATION_COUNTER_OFFER_CREATED");
    expect(actions).toContain("NEGOTIATION_ACCEPTED");
  });
});
