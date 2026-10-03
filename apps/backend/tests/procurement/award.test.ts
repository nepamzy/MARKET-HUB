import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { testApp } from "../helpers";
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

describe("Award", () => {
  it("lets the buyer award a valid, submitted response", async () => {
    const app = testApp();
    const { buyer, rfqId, responseId } = await setUp(app);

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/award`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId, reason: "Lowest price, acceptable lead time" });

    expect(res.status).toBe(201);
    expect(res.body.responseId).toBe(responseId);

    const rfq = await prisma.rfq.findUniqueOrThrow({ where: { id: rfqId } });
    expect(rfq.status).toBe("AWARDED");
  });

  it("rejects an award from an unauthorized organization", async () => {
    const app = testApp();
    const { rfqId, responseId } = await setUp(app);
    const stranger = await createBuyer(app);

    const res = await request(app)
      .post(`/api/organizations/${stranger.organizationId}/rfqs/${rfqId}/award`)
      .set("Authorization", `Bearer ${stranger.owner.accessToken}`)
      .send({ responseId });

    expect(res.status).toBe(404);
  });

  it("rejects awarding a response that does not belong to this RFQ", async () => {
    const app = testApp();
    const { buyer, rfqId } = await setUp(app);
    const other = await setUp(app);

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/award`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId: other.responseId });

    expect(res.status).toBe(400);
  });

  it("rejects a duplicate award on the same RFQ — idempotency/duplicate-command guard", async () => {
    const app = testApp();
    const { buyer, rfqId, responseId } = await setUp(app);
    await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/award`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId });

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/award`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId });

    expect(res.status).toBe(409);
    const count = await prisma.award.count({ where: { rfqId } });
    expect(count).toBe(1);
  });

  it("rejects awarding a response with an OPEN negotiation — the workflow must be resolved first", async () => {
    const app = testApp();
    const { buyer, rfqId, rfqItemId, responseId } = await setUp(app);
    await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/negotiations`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId, items: [{ rfqItemId, quantity: 100, unit: "PIECE", unitPriceMinor: 140000, currency: "NGN" }] });

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/award`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId });

    expect(res.status).toBe(409);
  });

  it("allows award once the negotiation has been resolved (accepted)", async () => {
    const app = testApp();
    const { buyer, supplier, rfqId, rfqItemId, responseId } = await setUp(app);
    const openRes = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/negotiations`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId, items: [{ rfqItemId, quantity: 100, unit: "PIECE", unitPriceMinor: 140000, currency: "NGN" }] });
    await request(app)
      .post(`/api/negotiations/${openRes.body.id}/respond`)
      .set("Authorization", `Bearer ${supplier.owner.accessToken}`)
      .send({ decision: "ACCEPT" });

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/award`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId });

    expect(res.status).toBe(201);
  });

  it("does NOT create an Order, a Payment, or a PurchaseOrder from an award", async () => {
    const app = testApp();
    const { buyer, rfqId, responseId } = await setUp(app);
    const ordersBefore = await prisma.order.count();

    await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/award`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId });

    const ordersAfter = await prisma.order.count();
    expect(ordersAfter).toBe(ordersBefore);
    // No Payment or PurchaseOrder model exists in the schema at all this
    // phase (Phase 8 §15) — their absence from the Prisma client itself is
    // the strongest possible assertion that none was introduced.
    expect((prisma as unknown as Record<string, unknown>).payment).toBeUndefined();
    expect((prisma as unknown as Record<string, unknown>).purchaseOrder).toBeUndefined();
  });

  it("once AWARDED, further negotiation actions on the RFQ are rejected", async () => {
    const app = testApp();
    const { buyer, rfqId, rfqItemId, responseId } = await setUp(app);
    await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/award`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId });

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/negotiations`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId, items: [{ rfqItemId, quantity: 100, unit: "PIECE", unitPriceMinor: 140000, currency: "NGN" }] });

    expect(res.status).toBe(409);
  });

  it("tells the winning supplier they were awarded, without revealing this to other suppliers", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const winner = await createSupplier(app);
    const loser = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
    const { rfqId, items } = await createIssuedRfq(app, buyer.owner.accessToken, buyer.organizationId, requisitionId, [
      winner.organizationId,
      loser.organizationId,
    ]);
    const rfqItemId = items[0]!.id;
    const { responseId: winnerResponseId } = await createSubmittedResponse(
      app,
      winner.owner.accessToken,
      winner.organizationId,
      rfqId,
      rfqItemId,
      150000
    );
    await createSubmittedResponse(app, loser.owner.accessToken, loser.organizationId, rfqId, rfqItemId, 180000);

    await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/award`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId: winnerResponseId });

    const winnerView = await request(app).get(`/api/rfqs/${rfqId}`).set("Authorization", `Bearer ${winner.owner.accessToken}`);
    const loserView = await request(app).get(`/api/rfqs/${rfqId}`).set("Authorization", `Bearer ${loser.owner.accessToken}`);

    expect(winnerView.body.youWereAwarded).toBe(true);
    expect(loserView.body.youWereAwarded).toBe(false);
    // The losing supplier's payload must not reveal who the winner was.
    expect(JSON.stringify(loserView.body)).not.toContain(winner.organizationId);
  });

  it("records an AWARD_CREATED audit event", async () => {
    const app = testApp();
    const { buyer, rfqId, responseId } = await setUp(app);
    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/award`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId });

    const logs = await prisma.auditLog.findMany({ where: { targetType: "Award", targetId: res.body.id } });
    expect(logs.map((l) => l.action)).toContain("AWARD_CREATED");
  });
});
