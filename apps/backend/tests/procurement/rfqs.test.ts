import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { registerAndLogin, testApp } from "../helpers";
import { createBuyer, createIssuedRfq, createSubmittedRequisition, createSupplier } from "./helpers";

describe("RFQs", () => {
  it("creates an RFQ from a SUBMITTED requisition, copying its items", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const supplier = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId, [
      { itemName: "Steel rods", quantity: 100, unit: "PIECE" },
    ]);

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ requisitionId, title: "Steel RFQ", supplierOrganizationIds: [supplier.organizationId] });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.buyerOrganizationId).toBe(buyer.organizationId);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].itemName).toBe("Steel rods");
    expect(res.body.items[0].quantity).toBe(100);
    expect(res.body.targets).toHaveLength(1);
    expect(res.body.targets[0].supplierOrganizationId).toBe(supplier.organizationId);
  });

  it("transitions the originating requisition to RFQ_CREATED", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const supplier = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);

    await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ requisitionId, title: "RFQ", supplierOrganizationIds: [supplier.organizationId] });

    const requisition = await prisma.requisition.findUniqueOrThrow({ where: { id: requisitionId } });
    expect(requisition.status).toBe("RFQ_CREATED");
  });

  it("rejects creating a second RFQ from the same requisition — idempotency/duplicate-command guard", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const supplier = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
    await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ requisitionId, title: "First RFQ", supplierOrganizationIds: [supplier.organizationId] });

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ requisitionId, title: "Duplicate RFQ", supplierOrganizationIds: [supplier.organizationId] });

    expect(res.status).toBe(409);
    const rfqCount = await prisma.rfq.count({ where: { requisitionId } });
    expect(rfqCount).toBe(1);
  });

  it("rejects creating an RFQ from a requisition belonging to a different organization — correct ownership", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const other = await createBuyer(app);
    const supplier = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);

    const res = await request(app)
      .post(`/api/organizations/${other.organizationId}/rfqs`)
      .set("Authorization", `Bearer ${other.owner.accessToken}`)
      .send({ requisitionId, title: "RFQ", supplierOrganizationIds: [supplier.organizationId] });

    expect(res.status).toBe(404);
  });

  it("rejects creating an RFQ from a still-DRAFT requisition", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const supplier = await createSupplier(app);
    const draftRes = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/requisitions`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ title: "Draft", items: [{ itemName: "Item", quantity: 1, unit: "PIECE" }] });

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ requisitionId: draftRes.body.id, title: "RFQ", supplierOrganizationIds: [supplier.organizationId] });

    expect(res.status).toBe(409);
  });

  it("rejects targeting an organization with no active SupplierProfile", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const notASupplier = await createBuyer(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ requisitionId, title: "RFQ", supplierOrganizationIds: [notASupplier.organizationId] });

    expect(res.status).toBe(400);
  });

  it("issues a DRAFT RFQ", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const supplier = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
    const createRes = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ requisitionId, title: "RFQ", supplierOrganizationIds: [supplier.organizationId] });

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${createRes.body.id}/issue`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ISSUED");
    expect(res.body.issuedAt).not.toBeNull();
  });

  it("rejects issuing an already-ISSUED RFQ — invalid transition rejected", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const supplier = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
    const { rfqId } = await createIssuedRfq(app, buyer.owner.accessToken, buyer.organizationId, requisitionId, [
      supplier.organizationId,
    ]);

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/issue`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);

    expect(res.status).toBe(409);
  });

  it("adds a further supplier target to an existing RFQ", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const supplierA = await createSupplier(app);
    const supplierB = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
    const { rfqId } = await createIssuedRfq(app, buyer.owner.accessToken, buyer.organizationId, requisitionId, [
      supplierA.organizationId,
    ]);

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/targets`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ supplierOrganizationIds: [supplierB.organizationId] });

    expect(res.status).toBe(200);
    expect(res.body.targets).toHaveLength(2);
  });

  it("a buyer sees its own RFQ via the generic detail route", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const supplier = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
    const { rfqId } = await createIssuedRfq(app, buyer.owner.accessToken, buyer.organizationId, requisitionId, [
      supplier.organizationId,
    ]);

    const res = await request(app).get(`/api/rfqs/${rfqId}`).set("Authorization", `Bearer ${buyer.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.viewerRole).toBe("buyer");
  });

  it("a targeted supplier sees the RFQ via the generic detail route, without other suppliers' targets", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const supplierA = await createSupplier(app);
    const supplierB = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
    const { rfqId } = await createIssuedRfq(app, buyer.owner.accessToken, buyer.organizationId, requisitionId, [
      supplierA.organizationId,
      supplierB.organizationId,
    ]);

    const res = await request(app)
      .get(`/api/rfqs/${rfqId}`)
      .set("Authorization", `Bearer ${supplierA.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.viewerRole).toBe("supplier");
    expect(res.body.viewerSupplierOrganizationId).toBe(supplierA.organizationId);
    expect(res.body.targets).toBeUndefined();
  });

  it("an untargeted supplier cannot access the RFQ — 404, not 403, no enumeration", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const targetedSupplier = await createSupplier(app);
    const untargetedSupplier = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
    const { rfqId } = await createIssuedRfq(app, buyer.owner.accessToken, buyer.organizationId, requisitionId, [
      targetedSupplier.organizationId,
    ]);

    const res = await request(app)
      .get(`/api/rfqs/${rfqId}`)
      .set("Authorization", `Bearer ${untargetedSupplier.owner.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("an unrelated authenticated user cannot access the RFQ at all", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const supplier = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
    const { rfqId } = await createIssuedRfq(app, buyer.owner.accessToken, buyer.organizationId, requisitionId, [
      supplier.organizationId,
    ]);
    const stranger = await registerAndLogin(app);

    const res = await request(app).get(`/api/rfqs/${rfqId}`).set("Authorization", `Bearer ${stranger.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("a targeted supplier cannot see a still-DRAFT RFQ — issuance gates visibility", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const supplier = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
    const createRes = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ requisitionId, title: "RFQ", supplierOrganizationIds: [supplier.organizationId] });

    const res = await request(app)
      .get(`/api/rfqs/${createRes.body.id}`)
      .set("Authorization", `Bearer ${supplier.owner.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("a supplier's RFQ inbox lists only RFQs targeting that organization", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const supplierA = await createSupplier(app);
    const supplierB = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
    await createIssuedRfq(app, buyer.owner.accessToken, buyer.organizationId, requisitionId, [supplierA.organizationId]);

    const resA = await request(app)
      .get(`/api/organizations/${supplierA.organizationId}/rfq-inbox`)
      .set("Authorization", `Bearer ${supplierA.owner.accessToken}`);
    const resB = await request(app)
      .get(`/api/organizations/${supplierB.organizationId}/rfq-inbox`)
      .set("Authorization", `Bearer ${supplierB.owner.accessToken}`);

    expect(resA.status).toBe(200);
    expect(resA.body.targets).toHaveLength(1);
    expect(resB.status).toBe(200);
    expect(resB.body.targets).toHaveLength(0);
  });

  it("records RFQ_CREATED and RFQ_ISSUED audit events", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const supplier = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
    const { rfqId } = await createIssuedRfq(app, buyer.owner.accessToken, buyer.organizationId, requisitionId, [
      supplier.organizationId,
    ]);

    const logs = await prisma.auditLog.findMany({ where: { targetType: "Rfq", targetId: rfqId } });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain("RFQ_CREATED");
    expect(actions).toContain("RFQ_ISSUED");
  });
});
