import request from "supertest";
import type { Express } from "express";
import { registerAndLogin } from "../helpers";

export async function createOrg(app: Express, businessType = "DIRECT_BUSINESS") {
  const owner = await registerAndLogin(app);
  const orgRes = await request(app)
    .post("/api/organizations")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ legalName: `Org ${Math.random()}`, businessType });
  if (orgRes.status !== 201) {
    throw new Error(`Organization creation failed in test helper: ${orgRes.status} ${JSON.stringify(orgRes.body)}`);
  }
  return { owner, organizationId: orgRes.body.organization.id as string };
}

/** A buyer organization — any business type may raise a requisition. */
export const createBuyer = createOrg;

/** A supplier organization with an ACTIVE SupplierProfile, so it is a
 * valid RFQ-target per assertValidSupplierOrganizations. */
export async function createSupplier(app: Express, businessType = "WHOLESALER") {
  const supplier = await createOrg(app, businessType);
  const res = await request(app)
    .put(`/api/organizations/${supplier.organizationId}/supplier-profile`)
    .set("Authorization", `Bearer ${supplier.owner.accessToken}`)
    .send({ isActive: true, isDiscoverable: true });
  if (res.status !== 200) {
    throw new Error(`Supplier profile setup failed in test helper: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return supplier;
}

interface RequisitionItemOverride {
  itemName?: string;
  quantity?: number;
  unit?: string;
}

/** Creates and submits a requisition in one step — most RFQ tests need a
 * SUBMITTED requisition as their starting point, not a DRAFT. */
export async function createSubmittedRequisition(
  app: Express,
  buyerToken: string,
  organizationId: string,
  items: RequisitionItemOverride[] = [{ itemName: "Steel rods", quantity: 100, unit: "PIECE" }]
) {
  const createRes = await request(app)
    .post(`/api/organizations/${organizationId}/requisitions`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ title: "Quarterly supplies", items });
  if (createRes.status !== 201) {
    throw new Error(`Requisition creation failed in test helper: ${createRes.status} ${JSON.stringify(createRes.body)}`);
  }
  const requisitionId = createRes.body.id as string;

  const submitRes = await request(app)
    .post(`/api/organizations/${organizationId}/requisitions/${requisitionId}/submit`)
    .set("Authorization", `Bearer ${buyerToken}`);
  if (submitRes.status !== 200) {
    throw new Error(`Requisition submission failed in test helper: ${submitRes.status} ${JSON.stringify(submitRes.body)}`);
  }

  return { requisitionId };
}

/** Creates an RFQ from a SUBMITTED requisition and immediately issues it —
 * most supplier-response tests need an ISSUED RFQ as their starting point. */
export async function createIssuedRfq(
  app: Express,
  buyerToken: string,
  buyerOrganizationId: string,
  requisitionId: string,
  supplierOrganizationIds: string[]
) {
  const createRes = await request(app)
    .post(`/api/organizations/${buyerOrganizationId}/rfqs`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ requisitionId, title: "RFQ for quarterly supplies", supplierOrganizationIds });
  if (createRes.status !== 201) {
    throw new Error(`RFQ creation failed in test helper: ${createRes.status} ${JSON.stringify(createRes.body)}`);
  }
  const rfqId = createRes.body.id as string;

  const issueRes = await request(app)
    .post(`/api/organizations/${buyerOrganizationId}/rfqs/${rfqId}/issue`)
    .set("Authorization", `Bearer ${buyerToken}`);
  if (issueRes.status !== 200) {
    throw new Error(`RFQ issuance failed in test helper: ${issueRes.status} ${JSON.stringify(issueRes.body)}`);
  }

  return { rfqId, items: issueRes.body.items as Array<{ id: string }> };
}

/** Creates and submits a supplier response for an ISSUED RFQ — most
 * Phase 8 comparison/negotiation/award tests need a SUBMITTED response as
 * their starting point. */
export async function createSubmittedResponse(
  app: Express,
  supplierToken: string,
  supplierOrganizationId: string,
  rfqId: string,
  rfqItemId: string,
  unitPriceMinor = 150000
) {
  const createRes = await request(app)
    .post(`/api/organizations/${supplierOrganizationId}/rfqs/${rfqId}/response`)
    .set("Authorization", `Bearer ${supplierToken}`)
    .send({ items: [{ rfqItemId, quantity: 100, unit: "PIECE", unitPriceMinor, currency: "NGN" }] });
  if (createRes.status !== 201) {
    throw new Error(`Response creation failed in test helper: ${createRes.status} ${JSON.stringify(createRes.body)}`);
  }
  const responseId = createRes.body.id as string;

  const submitRes = await request(app)
    .post(`/api/organizations/${supplierOrganizationId}/rfqs/${rfqId}/response/submit`)
    .set("Authorization", `Bearer ${supplierToken}`);
  if (submitRes.status !== 200) {
    throw new Error(`Response submission failed in test helper: ${submitRes.status} ${JSON.stringify(submitRes.body)}`);
  }

  return { responseId };
}

/** Full buyer+supplier setup through to a fresh AWARDED RFQ — the starting
 * point most Phase 9 purchase-order tests need. Returns everything a test
 * might want to assert against (ids, the final unit price used). */
export async function createAwardedRfq(app: Express, unitPriceMinor = 150000) {
  const buyer = await createBuyer(app);
  const supplier = await createSupplier(app);
  const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
  const { rfqId, items } = await createIssuedRfq(app, buyer.owner.accessToken, buyer.organizationId, requisitionId, [
    supplier.organizationId,
  ]);
  const rfqItemId = items[0]!.id;
  const { responseId } = await createSubmittedResponse(
    app,
    supplier.owner.accessToken,
    supplier.organizationId,
    rfqId,
    rfqItemId,
    unitPriceMinor
  );

  const awardRes = await request(app)
    .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/award`)
    .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
    .send({ responseId });
  if (awardRes.status !== 201) {
    throw new Error(`Award failed in test helper: ${awardRes.status} ${JSON.stringify(awardRes.body)}`);
  }

  return { buyer, supplier, rfqId, rfqItemId, responseId, unitPriceMinor };
}
