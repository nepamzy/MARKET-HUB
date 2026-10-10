import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { testApp } from "../helpers";
import { createBuyer, createSubmittedRequisition } from "./helpers";

describe("Requisitions", () => {
  it("creates a draft requisition with its items", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/requisitions`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({
        title: "Office supplies",
        items: [{ itemName: "A4 paper reams", quantity: 50, unit: "CARTON" }],
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.reference).toMatch(/^REQ-\d{6}$/);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].itemName).toBe("A4 paper reams");
  });

  it("allows a requisition item with no productId — custom/out-of-catalogue procurement", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/requisitions`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ title: "Custom part", items: [{ itemName: "Bespoke bracket, 40mm", quantity: 20, unit: "PIECE" }] });

    expect(res.status).toBe(201);
    expect(res.body.items[0].productId).toBeNull();
  });

  it("retrieves a requisition owned by the organization", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);

    const res = await request(app)
      .get(`/api/organizations/${buyer.organizationId}/requisitions/${requisitionId}`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(requisitionId);
  });

  it("returns 404 for a requisition belonging to a different organization — cross-org access denied", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const other = await createBuyer(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);

    const res = await request(app)
      .get(`/api/organizations/${other.organizationId}/requisitions/${requisitionId}`)
      .set("Authorization", `Bearer ${other.owner.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("updates a DRAFT requisition's items wholesale", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const createRes = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/requisitions`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ title: "Draft", items: [{ itemName: "Item A", quantity: 1, unit: "PIECE" }] });

    const res = await request(app)
      .patch(`/api/organizations/${buyer.organizationId}/requisitions/${createRes.body.id}`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ items: [{ itemName: "Item B", quantity: 2, unit: "CARTON" }] });

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].itemName).toBe("Item B");
  });

  it("rejects updating a requisition that is no longer DRAFT", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);

    const res = await request(app)
      .patch(`/api/organizations/${buyer.organizationId}/requisitions/${requisitionId}`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ title: "Should not apply" });

    expect(res.status).toBe(409);
  });

  it("submits a DRAFT requisition", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const createRes = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/requisitions`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ title: "To submit", items: [{ itemName: "Item", quantity: 1, unit: "PIECE" }] });

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/requisitions/${createRes.body.id}/submit`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("SUBMITTED");
    expect(res.body.submittedAt).not.toBeNull();
  });

  it("rejects an invalid state transition (submitting an already-SUBMITTED requisition twice)", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/requisitions/${requisitionId}/submit`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);

    expect(res.status).toBe(409);
  });

  it("cancels a SUBMITTED requisition with a reason", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/requisitions/${requisitionId}/cancel`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ reason: "No longer needed" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CANCELLED");
    expect(res.body.cancelReason).toBe("No longer needed");
  });

  it("retains a cancelled requisition rather than deleting it", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
    await request(app)
      .post(`/api/organizations/${buyer.organizationId}/requisitions/${requisitionId}/cancel`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);

    const stored = await prisma.requisition.findUnique({ where: { id: requisitionId } });
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe("CANCELLED");
  });

  it("a requisition list never includes another organization's requisitions", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const other = await createBuyer(app);
    await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);

    const res = await request(app)
      .get(`/api/organizations/${other.organizationId}/requisitions`)
      .set("Authorization", `Bearer ${other.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.requisitions).toHaveLength(0);
  });

  it("records REQUISITION_CREATED and REQUISITION_SUBMITTED audit events", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);

    const logs = await prisma.auditLog.findMany({ where: { targetType: "Requisition", targetId: requisitionId } });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain("REQUISITION_CREATED");
    expect(actions).toContain("REQUISITION_SUBMITTED");
  });

  it("rejects a non-member of the organization entirely", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
    const stranger = await createBuyer(app);

    const res = await request(app)
      .get(`/api/organizations/${buyer.organizationId}/requisitions/${requisitionId}`)
      .set("Authorization", `Bearer ${stranger.owner.accessToken}`);

    expect(res.status).toBe(403);
  });
});
