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
