import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { registerAndLogin, testApp } from "../helpers";
import { createAwardedRfq, createBuyer, createIssuedRfq, createSubmittedRequisition, createSubmittedResponse, createSupplier } from "./helpers";

async function createPo(app: ReturnType<typeof testApp>, buyer: { organizationId: string; owner: { accessToken: string } }, rfqId: string, notes?: string) {
  const res = await request(app)
    .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/purchase-order`)
    .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
    .send(notes ? { notes } : {});
  if (res.status !== 201) {
    throw new Error(`PO creation failed in test helper: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as { id: string; status: string; subtotalMinor: number; currency: string };
}

describe("Purchase Order — creation from Award", () => {
  it("creates a PO from a valid Award with the awarded commercial snapshot", async () => {
    const app = testApp();
    const { buyer, supplier, rfqId, rfqItemId, responseId, unitPriceMinor } = await createAwardedRfq(app, 150000);

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/purchase-order`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ notes: "Deliver to main warehouse" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.rfqId).toBe(rfqId);
    expect(res.body.responseId).toBe(responseId);
    expect(res.body.buyerOrganizationId).toBe(buyer.organizationId);
    expect(res.body.supplierOrganizationId).toBe(supplier.organizationId);
    expect(res.body.currency).toBe("NGN");
    expect(res.body.subtotalMinor).toBe(unitPriceMinor * 100);
    expect(res.body.totalMinor).toBe(unitPriceMinor * 100);
    expect(res.body.totalQuantity).toBe(100);
    expect(res.body.notes).toBe("Deliver to main warehouse");
    expect(res.body.reference).toMatch(/^PO-\d{6}$/);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].rfqItemId).toBe(rfqItemId);
    expect(res.body.items[0].unitPriceMinor).toBe(unitPriceMinor);
    expect(res.body.items[0].quantity).toBe(100);
    expect(res.body.items[0].lineTotalMinor).toBe(unitPriceMinor * 100);
    expect(res.body.items[0].currency).toBe("NGN");
  });

  it("snapshots a catalogue item's name/specification from the RFQ item, independent of the live product", async () => {
    const app = testApp();
    const { buyer, rfqId } = await createAwardedRfq(app);

    const res = await createPo(app, buyer, rfqId);
    expect(res.items[0].itemName).toBe("Steel rods");
  });

  it("supports a custom/non-catalogue item (no productId) and snapshots it the same way", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const supplier = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId, [
      { itemName: "Bespoke industrial gasket", quantity: 10, unit: "PIECE" },
    ]);
    const { rfqId, items } = await createIssuedRfq(app, buyer.owner.accessToken, buyer.organizationId, requisitionId, [
      supplier.organizationId,
    ]);
    const { responseId } = await createSubmittedResponse(app, supplier.owner.accessToken, supplier.organizationId, rfqId, items[0]!.id, 500000);
    await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/award`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId });

    const res = await createPo(app, buyer, rfqId);
    expect(res.items[0].itemName).toBe("Bespoke industrial gasket");
    expect(res.items[0].productId ?? null).toBeNull();
  });

  it("rejects creating a PO from an RFQ that has not been awarded", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const supplier = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
    const { rfqId } = await createIssuedRfq(app, buyer.owner.accessToken, buyer.organizationId, requisitionId, [supplier.organizationId]);

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/purchase-order`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({});

    expect(res.status).toBe(409);
  });

  it("rejects an unauthorized organization creating a PO for someone else's RFQ", async () => {
    const app = testApp();
    const { rfqId } = await createAwardedRfq(app);
    const stranger = await createBuyer(app);

    const res = await request(app)
      .post(`/api/organizations/${stranger.organizationId}/rfqs/${rfqId}/purchase-order`)
      .set("Authorization", `Bearer ${stranger.owner.accessToken}`)
      .send({});

    expect(res.status).toBe(404);
  });

  it("rejects a STAFF member creating a PO (MANAGER+ required)", async () => {
    const app = testApp();
    const { buyer, rfqId } = await createAwardedRfq(app);
    const staffUser = await registerAndLogin(app);
    await request(app)
      .post(`/api/organizations/${buyer.organizationId}/members`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ email: staffUser.email, role: "STAFF" });

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/purchase-order`)
      .set("Authorization", `Bearer ${staffUser.accessToken}`)
      .send({});

    expect(res.status).toBe(403);
  });

  it("enforces one PO per Award — a duplicate creation attempt is a controlled conflict, not a duplicate row", async () => {
    const app = testApp();
    const { buyer, rfqId } = await createAwardedRfq(app);
    await createPo(app, buyer, rfqId);

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/purchase-order`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({});

    expect(res.status).toBe(409);
    const count = await prisma.purchaseOrder.count({ where: { rfqId } });
    expect(count).toBe(1);
  });

  it("resolves the final price from the accepted negotiation, not the original response", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const supplier = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
    const { rfqId, items } = await createIssuedRfq(app, buyer.owner.accessToken, buyer.organizationId, requisitionId, [
      supplier.organizationId,
    ]);
    const rfqItemId = items[0]!.id;
    const { responseId } = await createSubmittedResponse(app, supplier.owner.accessToken, supplier.organizationId, rfqId, rfqItemId, 150000);

    const openRes = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/negotiations`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId, items: [{ rfqItemId, quantity: 100, unit: "PIECE", unitPriceMinor: 140000, currency: "NGN" }] });
    await request(app)
      .post(`/api/negotiations/${openRes.body.id}/respond`)
      .set("Authorization", `Bearer ${supplier.owner.accessToken}`)
      .send({ decision: "ACCEPT" });
    await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/award`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId });

    const res = await createPo(app, buyer, rfqId);
    // The negotiated 140000, never the original 150000 the response started at.
    expect(res.items[0]!.unitPriceMinor).toBe(140000);
    expect(res.subtotalMinor).toBe(140000 * 100);
  });

  it("rejects creating a PO when the awarded response has since been withdrawn", async () => {
    const app = testApp();
    const { buyer, supplier, rfqId } = await createAwardedRfq(app);
    // Nothing in Phase 7/8 currently blocks withdrawal after award — Phase 9
    // must defend against building a PO on a no-longer-SUBMITTED response.
    await request(app)
      .post(`/api/organizations/${supplier.organizationId}/rfqs/${rfqId}/response/withdraw`)
      .set("Authorization", `Bearer ${supplier.owner.accessToken}`);

    const res = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/purchase-order`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({});

    expect(res.status).toBe(409);
  });

  it("runs the whole creation inside a transaction — a failed creation leaves no orphaned PurchaseOrderItem rows", async () => {
    const app = testApp();
    const { buyer, rfqId } = await createAwardedRfq(app);
    await createPo(app, buyer, rfqId);
    const itemsBefore = await prisma.purchaseOrderItem.count();

    // The duplicate attempt below is rejected before any write — confirms
    // no partial items were created for the rejected second attempt.
    await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/purchase-order`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({});

    const itemsAfter = await prisma.purchaseOrderItem.count();
    expect(itemsAfter).toBe(itemsBefore);
  });

  it("records a PO_CREATED audit event", async () => {
    const app = testApp();
    const { buyer, rfqId } = await createAwardedRfq(app);
    const po = await createPo(app, buyer, rfqId);

    const logs = await prisma.auditLog.findMany({ where: { targetType: "PurchaseOrder", targetId: po.id } });
    expect(logs.map((l) => l.action)).toContain("PO_CREATED");
  });
});

describe("Purchase Order — state machine", () => {
  it("walks DRAFT -> PENDING_APPROVAL -> APPROVED -> CONFIRMED", async () => {
    const app = testApp();
    const { buyer, supplier, rfqId } = await createAwardedRfq(app);
    const po = await createPo(app, buyer, rfqId);

    const submitRes = await request(app)
      .post(`/api/purchase-orders/${po.id}/submit-for-approval`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.status).toBe("PENDING_APPROVAL");

    const approveRes = await request(app)
      .post(`/api/purchase-orders/${po.id}/approve`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe("APPROVED");

    const confirmRes = await request(app)
      .post(`/api/purchase-orders/${po.id}/confirm`)
      .set("Authorization", `Bearer ${supplier.owner.accessToken}`);
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.status).toBe("CONFIRMED");
  });

  it("rejects an invalid transition — approve before submit-for-approval", async () => {
    const app = testApp();
    const { buyer, rfqId } = await createAwardedRfq(app);
    const po = await createPo(app, buyer, rfqId);

    const res = await request(app)
      .post(`/api/purchase-orders/${po.id}/approve`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);

    expect(res.status).toBe(409);
  });

  it("rejects an invalid transition — confirm before approval", async () => {
    const app = testApp();
    const { buyer, supplier, rfqId } = await createAwardedRfq(app);
    const po = await createPo(app, buyer, rfqId);
    await request(app)
      .post(`/api/purchase-orders/${po.id}/submit-for-approval`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);

    const res = await request(app)
      .post(`/api/purchase-orders/${po.id}/confirm`)
      .set("Authorization", `Bearer ${supplier.owner.accessToken}`);

    expect(res.status).toBe(409);
  });

  it("rejects a repeated submit-for-approval (no going back to DRAFT, no double submission)", async () => {
    const app = testApp();
    const { buyer, rfqId } = await createAwardedRfq(app);
    const po = await createPo(app, buyer, rfqId);
    await request(app)
      .post(`/api/purchase-orders/${po.id}/submit-for-approval`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);

    const res = await request(app)
      .post(`/api/purchase-orders/${po.id}/submit-for-approval`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);

    expect(res.status).toBe(409);
  });

  it("rejects the supplier attempting to confirm before the buyer approves", async () => {
    const app = testApp();
    const { buyer, supplier, rfqId } = await createAwardedRfq(app);
    const po = await createPo(app, buyer, rfqId);
    await request(app)
      .post(`/api/purchase-orders/${po.id}/submit-for-approval`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);

    const res = await request(app)
      .post(`/api/purchase-orders/${po.id}/confirm`)
      .set("Authorization", `Bearer ${supplier.owner.accessToken}`);

    expect(res.status).toBe(409);
  });

  it("there is no generic PATCH endpoint for arbitrary status mutation", async () => {
    const app = testApp();
    const { buyer, rfqId } = await createAwardedRfq(app);
    const po = await createPo(app, buyer, rfqId);

    const res = await request(app)
      .patch(`/api/purchase-orders/${po.id}`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ status: "CONFIRMED" });

    expect(res.status).toBe(404);
  });
});

describe("Purchase Order — related RFQ context (frontend contract)", () => {
  it("exposes the parent RFQ's id, reference and title on both detail and list responses", async () => {
    const app = testApp();
    const { buyer, supplier, rfqId } = await createAwardedRfq(app);
    const po = await createPo(app, buyer, rfqId);

    const detail = await request(app).get(`/api/purchase-orders/${po.id}`).set("Authorization", `Bearer ${supplier.owner.accessToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.rfqId).toBe(rfqId);
    expect(detail.body.rfqReference).toMatch(/^RFQ-\d{6}$/);
    expect(typeof detail.body.rfqTitle).toBe("string");
    expect(detail.body.rfq).toBeUndefined();

    const list = await request(app)
      .get(`/api/organizations/${buyer.organizationId}/purchase-orders`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.purchaseOrders[0].rfqId).toBe(rfqId);
    expect(list.body.purchaseOrders[0].rfqReference).toBe(detail.body.rfqReference);
    expect(list.body.purchaseOrders[0].rfqTitle).toBe(detail.body.rfqTitle);
  });
});

describe("Purchase Order — authorization & privacy", () => {
  it("lets the buyer (STAFF+) view the PO", async () => {
    const app = testApp();
    const { buyer, rfqId } = await createAwardedRfq(app);
    const po = await createPo(app, buyer, rfqId);

    const res = await request(app).get(`/api/purchase-orders/${po.id}`).set("Authorization", `Bearer ${buyer.owner.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.viewerRole).toBe("buyer");
  });

  it("lets the awarded supplier (STAFF+) view the PO", async () => {
    const app = testApp();
    const { buyer, supplier, rfqId } = await createAwardedRfq(app);
    const po = await createPo(app, buyer, rfqId);

    const res = await request(app).get(`/api/purchase-orders/${po.id}`).set("Authorization", `Bearer ${supplier.owner.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.viewerRole).toBe("supplier");
  });

  it("gives an unrelated organization's member the same 404 a nonexistent PO would — never leaks existence", async () => {
    const app = testApp();
    const { buyer, rfqId } = await createAwardedRfq(app);
    const po = await createPo(app, buyer, rfqId);
    const stranger = await createBuyer(app);

    const strangerRes = await request(app).get(`/api/purchase-orders/${po.id}`).set("Authorization", `Bearer ${stranger.owner.accessToken}`);
    const bogusRes = await request(app)
      .get(`/api/purchase-orders/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${stranger.owner.accessToken}`);

    expect(strangerRes.status).toBe(404);
    expect(bogusRes.status).toBe(404);
  });

  it("buyer list only ever returns this organization's own buyer-side POs", async () => {
    const app = testApp();
    const { buyer, rfqId } = await createAwardedRfq(app);
    await createPo(app, buyer, rfqId);
    const other = await createAwardedRfq(app);
    await createPo(app, other.buyer, other.rfqId);

    const res = await request(app)
      .get(`/api/organizations/${buyer.organizationId}/purchase-orders`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.purchaseOrders).toHaveLength(1);
    expect(res.body.purchaseOrders[0].buyerOrganizationName).toBeDefined();
  });

  it("supplier list only ever returns this organization's own supplier-side POs", async () => {
    const app = testApp();
    const { buyer, supplier, rfqId } = await createAwardedRfq(app);
    await createPo(app, buyer, rfqId);
    const other = await createAwardedRfq(app);
    await createPo(app, other.buyer, other.rfqId);

    const res = await request(app)
      .get(`/api/organizations/${supplier.organizationId}/supplier-purchase-orders`)
      .set("Authorization", `Bearer ${supplier.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.purchaseOrders).toHaveLength(1);
  });

  it("rejects an unrelated organization listing another org's buyer POs (cross-org isolation)", async () => {
    const app = testApp();
    const { buyer, rfqId } = await createAwardedRfq(app);
    await createPo(app, buyer, rfqId);
    const stranger = await createBuyer(app);

    const res = await request(app)
      .get(`/api/organizations/${buyer.organizationId}/purchase-orders`)
      .set("Authorization", `Bearer ${stranger.owner.accessToken}`);

    expect(res.status).toBe(403);
  });

  it("rejects the supplier submitting for approval or approving — buyer-only actions", async () => {
    const app = testApp();
    const { buyer, supplier, rfqId } = await createAwardedRfq(app);
    const po = await createPo(app, buyer, rfqId);

    const submitRes = await request(app)
      .post(`/api/purchase-orders/${po.id}/submit-for-approval`)
      .set("Authorization", `Bearer ${supplier.owner.accessToken}`);
    expect(submitRes.status).toBe(404);

    const approveRes = await request(app)
      .post(`/api/purchase-orders/${po.id}/approve`)
      .set("Authorization", `Bearer ${supplier.owner.accessToken}`);
    expect(approveRes.status).toBe(404);
  });

  it("rejects the buyer confirming — supplier-only action", async () => {
    const app = testApp();
    const { buyer, rfqId } = await createAwardedRfq(app);
    const po = await createPo(app, buyer, rfqId);
    await request(app)
      .post(`/api/purchase-orders/${po.id}/submit-for-approval`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);
    await request(app)
      .post(`/api/purchase-orders/${po.id}/approve`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);

    const res = await request(app)
      .post(`/api/purchase-orders/${po.id}/confirm`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);

    expect(res.status).toBe(404);
  });
});

describe("Purchase Order — audit events", () => {
  it("records PO_SUBMITTED_FOR_APPROVAL, PO_APPROVED, and PO_CONFIRMED through the full lifecycle", async () => {
    const app = testApp();
    const { buyer, supplier, rfqId } = await createAwardedRfq(app);
    const po = await createPo(app, buyer, rfqId);

    await request(app)
      .post(`/api/purchase-orders/${po.id}/submit-for-approval`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);
    await request(app)
      .post(`/api/purchase-orders/${po.id}/approve`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);
    await request(app)
      .post(`/api/purchase-orders/${po.id}/confirm`)
      .set("Authorization", `Bearer ${supplier.owner.accessToken}`);

    const logs = await prisma.auditLog.findMany({ where: { targetType: "PurchaseOrder", targetId: po.id } });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain("PO_SUBMITTED_FOR_APPROVAL");
    expect(actions).toContain("PO_APPROVED");
    expect(actions).toContain("PO_CONFIRMED");
  });
});

describe("Purchase Order — does not implement out-of-scope Phase 9 features", () => {
  it("does not create an Order, reserve inventory, or touch fulfillment/shipment/delivery state", async () => {
    const app = testApp();
    const { buyer, rfqId } = await createAwardedRfq(app);
    const ordersBefore = await prisma.order.count();
    // Payment exists as a model from Phase 10 onward, Fulfillment/Delivery
    // from Phase 12 onward — each created only via its own explicit
    // endpoint, never as a side effect of creating a PurchaseOrder — so
    // count them rather than asserting the models are absent, which
    // stopped being true once those phases landed. Shipment still doesn't
    // exist in the schema at all (delivery tracking uses the Delivery
    // model instead) — its absence from the Prisma client itself remains
    // the strongest possible assertion that it was never introduced.
    const paymentsBefore = await prisma.payment.count();
    const fulfillmentsBefore = await prisma.fulfillment.count();
    const deliveriesBefore = await prisma.delivery.count();

    await createPo(app, buyer, rfqId);

    const ordersAfter = await prisma.order.count();
    const paymentsAfter = await prisma.payment.count();
    const fulfillmentsAfter = await prisma.fulfillment.count();
    const deliveriesAfter = await prisma.delivery.count();
    expect(ordersAfter).toBe(ordersBefore);
    expect(paymentsAfter).toBe(paymentsBefore);
    expect(fulfillmentsAfter).toBe(fulfillmentsBefore);
    expect(deliveriesAfter).toBe(deliveriesBefore);
    expect((prisma as unknown as Record<string, unknown>).shipment).toBeUndefined();
  });
});
