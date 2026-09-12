import request from "supertest";
import { describe, expect, it } from "vitest";
import { promoteToPlatformAdmin, registerAndLogin, testApp } from "../helpers";

describe("Platform admin boundary", () => {
  it("blocks a regular CUSTOMER from admin endpoints", async () => {
    const app = testApp();
    const { accessToken } = await registerAndLogin(app);

    const res = await request(app).get("/api/admin/organizations").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it("blocks an organization OWNER from admin endpoints — org ownership does not grant platform admin", async () => {
    const app = testApp();
    const { accessToken } = await registerAndLogin(app);
    await request(app)
      .post("/api/organizations")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ legalName: "Owner Co", businessType: "RETAILER" });

    const res = await request(app).get("/api/admin/users").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it("blocks unauthenticated access to admin endpoints", async () => {
    const app = testApp();
    const res = await request(app).get("/api/admin/organizations");
    expect(res.status).toBe(401);
  });

  it("allows a PLATFORM_ADMIN to list organizations and update verification status", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const orgRes = await request(app)
      .post("/api/organizations")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ legalName: "Verifiable Co", businessType: "LOGISTICS_COMPANY" });

    const admin = await registerAndLogin(app);
    await promoteToPlatformAdmin(admin.userId);
    // The access token was issued before promotion but carries no cached
    // role — requireAuth re-reads platformRole from the DB every request.
    const listRes = await request(app)
      .get("/api/admin/organizations")
      .set("Authorization", `Bearer ${admin.accessToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.organizations.length).toBeGreaterThan(0);

    const verifyRes = await request(app)
      .patch(`/api/admin/organizations/${orgRes.body.organization.id}/verification`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ status: "VERIFIED" });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.organization.verificationStatus).toBe("VERIFIED");
  });

  it("rejects an invalid verification status value", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const orgRes = await request(app)
      .post("/api/organizations")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ legalName: "Bad Status Co", businessType: "RETAILER" });

    const admin = await registerAndLogin(app);
    await promoteToPlatformAdmin(admin.userId);

    const res = await request(app)
      .patch(`/api/admin/organizations/${orgRes.body.organization.id}/verification`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ status: "APPROVED_BY_MISTAKE" });

    expect(res.status).toBe(400);
  });
});
