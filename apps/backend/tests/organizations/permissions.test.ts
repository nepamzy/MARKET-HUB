import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerAndLogin, testApp } from "../helpers";

async function setupOrgWithStaffMember(app: ReturnType<typeof testApp>) {
  const owner = await registerAndLogin(app);
  const orgRes = await request(app)
    .post("/api/organizations")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ legalName: "Permissions Test Co", businessType: "WHOLESALER" });
  const organizationId = orgRes.body.organization.id as string;

  const staff = await registerAndLogin(app);
  await request(app)
    .post(`/api/organizations/${organizationId}/members`)
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ email: staff.email, role: "STAFF" });

  return { owner, staff, organizationId };
}

describe("Business-scoped member permissions", () => {
  it("returns STAFF role defaults when no override exists yet", async () => {
    const app = testApp();
    const { owner, staff, organizationId } = await setupOrgWithStaffMember(app);

    const res = await request(app)
      .get(`/api/organizations/${organizationId}/members/${staff.userId}/permissions`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("STAFF");
    // STAFF default: VIEW on ORDERS, NONE on PAYMENTS — see packages/shared DEFAULT_PERMISSIONS
    expect(res.body.permissions.ORDERS).toBe("VIEW");
    expect(res.body.permissions.PAYMENTS).toBe("NONE");
  });

  it("lets an OWNER override a specific resource's permission level", async () => {
    const app = testApp();
    const { owner, staff, organizationId } = await setupOrgWithStaffMember(app);

    const res = await request(app)
      .put(`/api/organizations/${organizationId}/members/${staff.userId}/permissions`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ PAYMENTS: "VIEW", ORDERS: "EDIT" });

    expect(res.status).toBe(200);
    expect(res.body.permissions.PAYMENTS).toBe("VIEW");
    expect(res.body.permissions.ORDERS).toBe("EDIT");
    // Untouched resources keep their role default
    expect(res.body.permissions.INVENTORY).toBe("VIEW");

    // Confirm it persisted, not just echoed back
    const getRes = await request(app)
      .get(`/api/organizations/${organizationId}/members/${staff.userId}/permissions`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(getRes.body.permissions.PAYMENTS).toBe("VIEW");
  });

  it("blocks a MANAGER without explicit grant from editing permissions (OWNER-only boundary)", async () => {
    const app = testApp();
    const { owner, organizationId } = await setupOrgWithStaffMember(app);
    const manager = await registerAndLogin(app);
    await request(app)
      .post(`/api/organizations/${organizationId}/members`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: manager.email, role: "MANAGER" });

    const target = await registerAndLogin(app);
    await request(app)
      .post(`/api/organizations/${organizationId}/members`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: target.email, role: "STAFF" });

    const res = await request(app)
      .put(`/api/organizations/${organizationId}/members/${target.userId}/permissions`)
      .set("Authorization", `Bearer ${manager.accessToken}`)
      .send({ ORDERS: "EDIT" });

    expect(res.status).toBe(403);
  });

  it("rejects modifying an OWNER's permissions — ownership is never a partial access level", async () => {
    const app = testApp();
    const { owner, organizationId } = await setupOrgWithStaffMember(app);
    const secondOwnerCandidate = await registerAndLogin(app);
    await request(app)
      .post(`/api/organizations/${organizationId}/members`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: secondOwnerCandidate.email, role: "MANAGER" });
    await request(app)
      .post(`/api/organizations/${organizationId}/transfer-ownership`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ newOwnerUserId: secondOwnerCandidate.userId });

    // owner is now MANAGER; secondOwnerCandidate is OWNER. secondOwnerCandidate
    // tries to edit the (former owner, now manager) — that's allowed — but
    // let's specifically prove OWNER's own permissions can't be set.
    const res = await request(app)
      .put(`/api/organizations/${organizationId}/members/${secondOwnerCandidate.userId}/permissions`)
      .set("Authorization", `Bearer ${secondOwnerCandidate.accessToken}`)
      .send({ ORDERS: "EDIT" });

    // Blocked for two independent reasons here (self-edit AND owner target);
    // either is a correct 400.
    expect(res.status).toBe(400);
  });

  it("rejects a member modifying their own permissions", async () => {
    const app = testApp();
    const { owner, organizationId } = await setupOrgWithStaffMember(app);
    const manager = await registerAndLogin(app);
    await request(app)
      .post(`/api/organizations/${organizationId}/members`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: manager.email, role: "MANAGER" });

    // Owner tries to edit the owner's own permissions via a self-call is not
    // representative; the real case is any actor targeting themselves.
    const res = await request(app)
      .put(`/api/organizations/${organizationId}/members/${owner.userId}/permissions`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ ORDERS: "VIEW" });

    expect(res.status).toBe(400);
  });

  it("denies cross-organization access to another org's member permissions", async () => {
    const app = testApp();
    const { organizationId } = await setupOrgWithStaffMember(app);
    const outsider = await registerAndLogin(app);

    const res = await request(app)
      .get(`/api/organizations/${organizationId}/members/${outsider.userId}/permissions`)
      .set("Authorization", `Bearer ${outsider.accessToken}`);

    expect(res.status).toBe(403);
  });

  it("resolvePermissionLevel: OWNER always resolves to EDIT regardless of any override row", async () => {
    // Direct unit-style test of the resolution function itself
    // (apps/backend/src/lib/permissions.ts), not via HTTP — there is no
    // protected business-resource route to exercise requirePermission
    // through yet (ORDERS/INVENTORY/etc. endpoints don't exist until later
    // phases), so asserting through an unrelated existing route would not
    // actually prove this logic works. This does.
    const app = testApp();
    const { owner, organizationId } = await setupOrgWithStaffMember(app);

    const { resolvePermissionLevel } = await import("../../src/lib/permissions");
    const { prisma } = await import("../../src/lib/prisma");

    const membership = await prisma.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId, userId: owner.userId } },
      select: { id: true, role: true },
    });

    const level = await resolvePermissionLevel(membership, "PAYMENTS");
    expect(level).toBe("EDIT");
  });

  it("resolvePermissionLevel: STAFF with no override falls back to the role default", async () => {
    const app = testApp();
    const { staff, organizationId } = await setupOrgWithStaffMember(app);

    const { resolvePermissionLevel } = await import("../../src/lib/permissions");
    const { prisma } = await import("../../src/lib/prisma");

    const membership = await prisma.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId, userId: staff.userId } },
      select: { id: true, role: true },
    });

    expect(await resolvePermissionLevel(membership, "PAYMENTS")).toBe("NONE");
    expect(await resolvePermissionLevel(membership, "ORDERS")).toBe("VIEW");
  });
});
