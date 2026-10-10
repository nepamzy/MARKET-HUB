import request from "supertest";
import { describe, expect, it } from "vitest";
import { testApp } from "../helpers";
import { createBuyer, createIssuedRfq, createSubmittedRequisition, createSubmittedResponse, createSupplier } from "./helpers";

async function setUp(app: ReturnType<typeof testApp>, supplierOrgCount = 2) {
  const buyer = await createBuyer(app);
  const suppliers = await Promise.all(Array.from({ length: supplierOrgCount }, () => createSupplier(app)));
  const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
  const { rfqId, items } = await createIssuedRfq(
    app,
    buyer.owner.accessToken,
    buyer.organizationId,
    requisitionId,
    suppliers.map((s) => s.organizationId)
  );
  return { buyer, suppliers, rfqId, rfqItemId: items[0]!.id };
}

describe("RFQ comparison", () => {
  it("lets the buyer retrieve a structured comparison of submitted responses", async () => {
    const app = testApp();
    const { buyer, suppliers, rfqId, rfqItemId } = await setUp(app);
    await createSubmittedResponse(app, suppliers[0]!.owner.accessToken, suppliers[0]!.organizationId, rfqId, rfqItemId, 150000);
    await createSubmittedResponse(app, suppliers[1]!.owner.accessToken, suppliers[1]!.organizationId, rfqId, rfqItemId, 180000);

    const res = await request(app)
      .get(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/comparison`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.responses).toHaveLength(2);
    const prices = res.body.responses.map((r: { items: { unitPriceMinor: number }[] }) => r.items[0]!.unitPriceMinor).sort();
    expect(prices).toEqual([150000, 180000]);
  });

  it("is based on real persisted response data, not mock data — reflects exactly what was submitted", async () => {
    const app = testApp();
    const { buyer, suppliers, rfqId, rfqItemId } = await setUp(app, 1);
    await createSubmittedResponse(app, suppliers[0]!.owner.accessToken, suppliers[0]!.organizationId, rfqId, rfqItemId, 123400);

    const res = await request(app)
      .get(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/comparison`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.responses[0].items[0].unitPriceMinor).toBe(123400);
    expect(res.body.responses[0].supplierOrganizationId).toBe(suppliers[0]!.organizationId);
    expect(res.body.responses[0].status).toBe("SUBMITTED");
  });

  it("preserves distinct currencies explicitly rather than converting — no cross-currency arithmetic", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const supplierNgn = await createSupplier(app);
    const supplierUsd = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
    const { rfqId, items } = await createIssuedRfq(app, buyer.owner.accessToken, buyer.organizationId, requisitionId, [
      supplierNgn.organizationId,
      supplierUsd.organizationId,
    ]);
    const rfqItemId = items[0]!.id;

    await request(app)
      .post(`/api/organizations/${supplierNgn.organizationId}/rfqs/${rfqId}/response`)
      .set("Authorization", `Bearer ${supplierNgn.owner.accessToken}`)
      .send({ items: [{ rfqItemId, quantity: 100, unit: "PIECE", unitPriceMinor: 150000, currency: "NGN" }] });
    await request(app)
      .post(`/api/organizations/${supplierNgn.organizationId}/rfqs/${rfqId}/response/submit`)
      .set("Authorization", `Bearer ${supplierNgn.owner.accessToken}`);

    await request(app)
      .post(`/api/organizations/${supplierUsd.organizationId}/rfqs/${rfqId}/response`)
      .set("Authorization", `Bearer ${supplierUsd.owner.accessToken}`)
      .send({ items: [{ rfqItemId, quantity: 100, unit: "PIECE", unitPriceMinor: 500, currency: "USD" }] });
    await request(app)
      .post(`/api/organizations/${supplierUsd.organizationId}/rfqs/${rfqId}/response/submit`)
      .set("Authorization", `Bearer ${supplierUsd.owner.accessToken}`);

    const res = await request(app)
      .get(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/comparison`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);

    expect(res.status).toBe(200);
    const currencies = res.body.responses.map((r: { items: { currency: string }[] }) => r.items[0]!.currency).sort();
    expect(currencies).toEqual(["NGN", "USD"]);
    // No computed cross-currency total anywhere in the payload.
    expect(res.body).not.toHaveProperty("grandTotal");
    expect(res.body).not.toHaveProperty("totalMinor");
  });

  it("rejects an unauthorized (non-member) user", async () => {
    const app = testApp();
    const { suppliers, rfqId, rfqItemId } = await setUp(app, 1);
    await createSubmittedResponse(app, suppliers[0]!.owner.accessToken, suppliers[0]!.organizationId, rfqId, rfqItemId);
    const stranger = await createBuyer(app);

    const res = await request(app)
      .get(`/api/organizations/${stranger.organizationId}/rfqs/${rfqId}/comparison`)
      .set("Authorization", `Bearer ${stranger.owner.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("rejects a supplier (not the buyer) trying to view the buyer's comparison via its own org scope", async () => {
    const app = testApp();
    const { suppliers, rfqId, rfqItemId } = await setUp(app, 1);
    await createSubmittedResponse(app, suppliers[0]!.owner.accessToken, suppliers[0]!.organizationId, rfqId, rfqItemId);

    const res = await request(app)
      .get(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/comparison`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("includes negotiation status when one exists for a response", async () => {
    const app = testApp();
    const { buyer, suppliers, rfqId, rfqItemId } = await setUp(app, 1);
    const { responseId } = await createSubmittedResponse(
      app,
      suppliers[0]!.owner.accessToken,
      suppliers[0]!.organizationId,
      rfqId,
      rfqItemId,
      150000
    );

    await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/negotiations`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId, items: [{ rfqItemId, quantity: 100, unit: "PIECE", unitPriceMinor: 140000, currency: "NGN" }] });

    const res = await request(app)
      .get(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/comparison`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.responses[0].negotiation).not.toBeNull();
    expect(res.body.responses[0].negotiation.status).toBe("OPEN");
  });
});
