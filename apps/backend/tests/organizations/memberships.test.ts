import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerAndLogin, testApp } from "../helpers";

async function setupOrgWithOwner(app: ReturnType<typeof testApp>) {
  const owner = await registerAndLogin(app);
  const orgRes = await request(app)
    .post("/api/organizations")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ legalName: "Membership Test Co", businessType: "WHOLESALER" });
  return { owner, organizationId: orgRes.body.organization.id as string };
}

describe("Organization membership management", () => {
  it("lets an OWNER add a member by email with STAFF or MANAGER role", async () => {
    const app = testApp();
    const { owner, organizationId } = await setupOrgWithOwner(app);
    const staff = await registerAndLogin(app);

    const res = await request(app)
      .post(`/api/organizations/${organizationId}/members`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: staff.email, role: "STAFF" });

    expect(res.status).toBe(201);
    expect(res.body.membership.role).toBe("STAFF");
  });

  it("rejects adding a member directly as OWNER", async () => {
    const app = testApp();
    const { owner, organizationId } = await setupOrgWithOwner(app);
    const other = await registerAndLogin(app);

    const res = await request(app)
      .post(`/api/organizations/${organizationId}/members`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: other.email, role: "OWNER" });

    expect(res.status).toBe(400);
  });

  it("rejects adding a member who has no MARKET HUB account", async () => {
    const app = testApp();
    const { owner, organizationId } = await setupOrgWithOwner(app);

    const res = await request(app)
      .post(`/api/organizations/${organizationId}/members`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: "nobody-registered@example.com", role: "STAFF" });

    expect(res.status).toBe(404);
  });

  it("blocks STAFF from adding new members (insufficient role)", async () => {
    const app = testApp();
    const { owner, organizationId } = await setupOrgWithOwner(app);
    const staff = await registerAndLogin(app);
    await request(app)
      .post(`/api/organizations/${organizationId}/members`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: staff.email, role: "STAFF" });

    const someoneElse = await registerAndLogin(app);
    const res = await request(app)
      .post(`/api/organizations/${organizationId}/members`)
      .set("Authorization", `Bearer ${staff.accessToken}`)
      .send({ email: someoneElse.email, role: "STAFF" });

    expect(res.status).toBe(403);
  });

  it("blocks a STAFF member from promoting themselves to MANAGER or OWNER", async () => {
    const app = testApp();
    const { owner, organizationId } = await setupOrgWithOwner(app);
    const staff = await registerAndLogin(app);
    await request(app)
      .post(`/api/organizations/${organizationId}/members`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: staff.email, role: "STAFF" });

    // Self-promotion attempt: the membership-role-change endpoint requires
    // OWNER, so a STAFF caller is rejected before any role logic runs.
    const res = await request(app)
      .patch(`/api/organizations/${organizationId}/members/${staff.userId}`)
      .set("Authorization", `Bearer ${staff.accessToken}`)
      .send({ role: "MANAGER" });

    expect(res.status).toBe(403);
  });

  it("blocks a MANAGER from changing member roles (OWNER-only action)", async () => {
    const app = testApp();
    const { owner, organizationId } = await setupOrgWithOwner(app);
    const manager = await registerAndLogin(app);
    await request(app)
      .post(`/api/organizations/${organizationId}/members`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: manager.email, role: "MANAGER" });
    const staff = await registerAndLogin(app);
    await request(app)
      .post(`/api/organizations/${organizationId}/members`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: staff.email, role: "STAFF" });

    const res = await request(app)
      .patch(`/api/organizations/${organizationId}/members/${staff.userId}`)
      .set("Authorization", `Bearer ${manager.accessToken}`)
      .send({ role: "MANAGER" });

    expect(res.status).toBe(403);
  });

  it("lets an OWNER promote/demote STAFF and MANAGER", async () => {
    const app = testApp();
    const { owner, organizationId } = await setupOrgWithOwner(app);
    const staff = await registerAndLogin(app);
    await request(app)
      .post(`/api/organizations/${organizationId}/members`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: staff.email, role: "STAFF" });

    const res = await request(app)
      .patch(`/api/organizations/${organizationId}/members/${staff.userId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ role: "MANAGER" });

    expect(res.status).toBe(200);
    expect(res.body.membership.role).toBe("MANAGER");
  });

  it("prevents removing or demoting the last remaining OWNER", async () => {
    const app = testApp();
    const { owner, organizationId } = await setupOrgWithOwner(app);

    const demoteRes = await request(app)
      .patch(`/api/organizations/${organizationId}/members/${owner.userId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ role: "MANAGER" });
    expect(demoteRes.status).toBe(409);

    const removeRes = await request(app)
      .delete(`/api/organizations/${organizationId}/members/${owner.userId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(removeRes.status).toBe(409);
  });

  it("allows explicit ownership transfer, demoting the previous owner to MANAGER", async () => {
    const app = testApp();
    const { owner, organizationId } = await setupOrgWithOwner(app);
    const newOwner = await registerAndLogin(app);
    await request(app)
      .post(`/api/organizations/${organizationId}/members`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: newOwner.email, role: "MANAGER" });

    const transferRes = await request(app)
      .post(`/api/organizations/${organizationId}/transfer-ownership`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ newOwnerUserId: newOwner.userId });
    expect(transferRes.status).toBe(204);

    const membersRes = await request(app)
      .get(`/api/organizations/${organizationId}/members`)
      .set("Authorization", `Bearer ${newOwner.accessToken}`);
    const roles = Object.fromEntries(
      membersRes.body.members.map((m: { user: { id: string }; role: string }) => [m.user.id, m.role])
    );
    expect(roles[newOwner.userId]).toBe("OWNER");
    expect(roles[owner.userId]).toBe("MANAGER");

    // The previous owner (now MANAGER) can no longer perform OWNER-only actions.
    const res = await request(app)
      .delete(`/api/organizations/${organizationId}/members/${newOwner.userId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(403);
  });

  it("lets an OWNER remove a non-owner member", async () => {
    const app = testApp();
    const { owner, organizationId } = await setupOrgWithOwner(app);
    const staff = await registerAndLogin(app);
    await request(app)
      .post(`/api/organizations/${organizationId}/members`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: staff.email, role: "STAFF" });

    const res = await request(app)
      .delete(`/api/organizations/${organizationId}/members/${staff.userId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(204);
  });
});
