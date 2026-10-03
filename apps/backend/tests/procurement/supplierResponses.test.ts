import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { testApp } from "../helpers";
import { createBuyer, createIssuedRfq, createSubmittedRequisition, createSupplier } from "./helpers";

async function setUpIssuedRfq(app: ReturnType<typeof testApp>, supplierOrgCount = 1) {
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

describe("Supplier responses", () => {
  it("lets a targeted supplier create a draft response", async () => {
    const app = testApp();
    const { suppliers, rfqId, rfqItemId } = await setUpIssuedRfq(app);

    const res = await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`)
      .send({ items: [{ rfqItemId, quantity: 100, unit: "PIECE", unitPriceMinor: 150000, currency: "NGN" }] });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.items[0].unitPriceMinor).toBe(150000);
    expect(res.body.items[0].currency).toBe("NGN");
  });

  it("rejects an untargeted supplier creating a response — relationship-based access", async () => {
    const app = testApp();
    const { rfqId, rfqItemId } = await setUpIssuedRfq(app);
    const untargeted = await createSupplier(app);

    const res = await request(app)
      .post(`/api/organizations/${untargeted.organizationId}/rfqs/${rfqId}/response`)
      .set("Authorization", `Bearer ${untargeted.owner.accessToken}`)
      .send({ items: [{ rfqItemId, quantity: 1, unit: "PIECE", unitPriceMinor: 100, currency: "NGN" }] });

    expect(res.status).toBe(404);
  });

  it("rejects a response item that does not map to a valid RFQ item", async () => {
    const app = testApp();
    const { suppliers, rfqId } = await setUpIssuedRfq(app);

    const res = await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`)
      .send({ items: [{ rfqItemId: "00000000-0000-0000-0000-000000000000", quantity: 1, unit: "PIECE", unitPriceMinor: 100, currency: "NGN" }] });

    expect(res.status).toBe(400);
  });

  it("rejects non-integer/non-positive pricing — integer minor-unit money rule", async () => {
    const app = testApp();
    const { suppliers, rfqId, rfqItemId } = await setUpIssuedRfq(app);

    const res = await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`)
      .send({ items: [{ rfqItemId, quantity: 1, unit: "PIECE", unitPriceMinor: 19.99, currency: "NGN" }] });

    expect(res.status).toBe(400);
  });

  it("rejects an invalid currency code", async () => {
    const app = testApp();
    const { suppliers, rfqId, rfqItemId } = await setUpIssuedRfq(app);

    const res = await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`)
      .send({ items: [{ rfqItemId, quantity: 1, unit: "PIECE", unitPriceMinor: 100, currency: "naira" }] });

    expect(res.status).toBe(400);
  });

  it("rejects creating a second response for the same RFQ — idempotency/duplicate-command guard", async () => {
    const app = testApp();
    const { suppliers, rfqId, rfqItemId } = await setUpIssuedRfq(app);
    const payload = { items: [{ rfqItemId, quantity: 1, unit: "PIECE", unitPriceMinor: 100, currency: "NGN" }] };
    await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`)
      .send(payload);

    const res = await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`)
      .send(payload);

    expect(res.status).toBe(409);
    const count = await prisma.supplierResponse.count({ where: { rfqId, supplierOrganizationId: suppliers[0]!.organizationId } });
    expect(count).toBe(1);
  });

  it("updates a DRAFT response's items wholesale", async () => {
    const app = testApp();
    const { suppliers, rfqId, rfqItemId } = await setUpIssuedRfq(app);
    await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`)
      .send({ items: [{ rfqItemId, quantity: 100, unit: "PIECE", unitPriceMinor: 150000, currency: "NGN" }] });

    const res = await request(app)
      .patch(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`)
      .send({ notes: "Revised offer", items: [{ rfqItemId, quantity: 100, unit: "PIECE", unitPriceMinor: 140000, currency: "NGN" }] });

    expect(res.status).toBe(200);
    expect(res.body.notes).toBe("Revised offer");
    expect(res.body.items[0].unitPriceMinor).toBe(140000);
  });

  it("submits a DRAFT response and marks the supplier target RESPONDED", async () => {
    const app = testApp();
    const { suppliers, rfqId, rfqItemId } = await setUpIssuedRfq(app);
    await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`)
      .send({ items: [{ rfqItemId, quantity: 100, unit: "PIECE", unitPriceMinor: 150000, currency: "NGN" }] });

    const res = await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response/submit`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("SUBMITTED");

    const target = await prisma.rfqSupplierTarget.findUniqueOrThrow({
      where: { rfqId_supplierOrganizationId: { rfqId, supplierOrganizationId: suppliers[0]!.organizationId } },
    });
    expect(target.status).toBe("RESPONDED");
  });

  it("rejects submitting an already-SUBMITTED response — invalid transition rejected", async () => {
    const app = testApp();
    const { suppliers, rfqId, rfqItemId } = await setUpIssuedRfq(app);
    await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`)
      .send({ items: [{ rfqItemId, quantity: 1, unit: "PIECE", unitPriceMinor: 100, currency: "NGN" }] });
    await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response/submit`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`);

    const res = await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response/submit`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`);

    expect(res.status).toBe(409);
  });

  it("rejects updating a response that is no longer DRAFT", async () => {
    const app = testApp();
    const { suppliers, rfqId, rfqItemId } = await setUpIssuedRfq(app);
    await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`)
      .send({ items: [{ rfqItemId, quantity: 1, unit: "PIECE", unitPriceMinor: 100, currency: "NGN" }] });
    await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response/submit`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`);

    const res = await request(app)
      .patch(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`)
      .send({ notes: "Too late" });

    expect(res.status).toBe(409);
  });

  it("withdraws a SUBMITTED response", async () => {
    const app = testApp();
    const { suppliers, rfqId, rfqItemId } = await setUpIssuedRfq(app);
    await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`)
      .send({ items: [{ rfqItemId, quantity: 1, unit: "PIECE", unitPriceMinor: 100, currency: "NGN" }] });
    await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response/submit`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`);

    const res = await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response/withdraw`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("WITHDRAWN");
  });

  it("rejects withdrawing a response still in DRAFT — nothing has been shared with the buyer yet", async () => {
    const app = testApp();
    const { suppliers, rfqId, rfqItemId } = await setUpIssuedRfq(app);
    await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`)
      .send({ items: [{ rfqItemId, quantity: 1, unit: "PIECE", unitPriceMinor: 100, currency: "NGN" }] });

    const res = await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response/withdraw`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`);

    expect(res.status).toBe(409);
  });

  it("the buyer sees a SUBMITTED response but not a competing supplier's DRAFT", async () => {
    const app = testApp();
    const { buyer, suppliers, rfqId, rfqItemId } = await setUpIssuedRfq(app, 2);
    await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`)
      .send({ items: [{ rfqItemId, quantity: 1, unit: "PIECE", unitPriceMinor: 100, currency: "NGN" }] });
    await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response/submit`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`);
    // supplier B creates a draft but never submits it
    await request(app)
      .post(`/api/organizations/${suppliers[1]!.organizationId}/rfqs/${rfqId}/response`)
      .set("Authorization", `Bearer ${suppliers[1]!.owner.accessToken}`)
      .send({ items: [{ rfqItemId, quantity: 1, unit: "PIECE", unitPriceMinor: 999, currency: "NGN" }] });

    const res = await request(app).get(`/api/rfqs/${rfqId}`).set("Authorization", `Bearer ${buyer.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.responses).toHaveLength(1);
    expect(res.body.responses[0].supplierOrganizationId).toBe(suppliers[0]!.organizationId);
    expect(res.body.responses[0].status).toBe("SUBMITTED");
  });

  it("a competing supplier cannot see another supplier's response via the generic RFQ route", async () => {
    const app = testApp();
    const { suppliers, rfqId, rfqItemId } = await setUpIssuedRfq(app, 2);
    await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`)
      .send({ items: [{ rfqItemId, quantity: 1, unit: "PIECE", unitPriceMinor: 100, currency: "NGN" }] });
    await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response/submit`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`);

    const res = await request(app)
      .get(`/api/rfqs/${rfqId}`)
      .set("Authorization", `Bearer ${suppliers[1]!.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.viewerRole).toBe("supplier");
    expect(res.body.response).toBeNull();
  });

  it("records SUPPLIER_RESPONSE_CREATED, SUBMITTED, and WITHDRAWN audit events", async () => {
    const app = testApp();
    const { suppliers, rfqId, rfqItemId } = await setUpIssuedRfq(app);
    const createRes = await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`)
      .send({ items: [{ rfqItemId, quantity: 1, unit: "PIECE", unitPriceMinor: 100, currency: "NGN" }] });
    await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response/submit`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`);
    await request(app)
      .post(`/api/organizations/${suppliers[0]!.organizationId}/rfqs/${rfqId}/response/withdraw`)
      .set("Authorization", `Bearer ${suppliers[0]!.owner.accessToken}`);

    const logs = await prisma.auditLog.findMany({ where: { targetType: "SupplierResponse", targetId: createRes.body.id } });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain("SUPPLIER_RESPONSE_CREATED");
    expect(actions).toContain("SUPPLIER_RESPONSE_SUBMITTED");
    expect(actions).toContain("SUPPLIER_RESPONSE_WITHDRAWN");
  });
});
