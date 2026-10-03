import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerAndLogin, testApp } from "../helpers";

async function createOrg(app: ReturnType<typeof testApp>, owner: Awaited<ReturnType<typeof registerAndLogin>>, name: string) {
  const res = await request(app)
    .post("/api/organizations")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ legalName: name, businessType: "WHOLESALER" });
  return res.body.organization.id as string;
}

async function makePlatformAdmin(userId: string) {
  const { prisma } = await import("../../src/lib/prisma");
  await prisma.user.update({ where: { id: userId }, data: { platformRole: "PLATFORM_ADMIN" } });
}

const DISCOVERABLE_PROFILE = {
  capabilities: ["WHOLESALER", "DISTRIBUTOR"],
  categories: ["beverages"],
  countriesServed: ["Kenya"],
  isDiscoverable: true,
};

describe("Supplier profile management", () => {
  it("returns null for a business that hasn't configured a supplier profile yet (not an error)", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Fresh Foods Ltd");

    const res = await request(app)
      .get(`/api/organizations/${organizationId}/supplier-profile`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("lets a MANAGER create/update the supplier profile", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Fresh Foods Ltd");

    const res = await request(app)
      .put(`/api/organizations/${organizationId}/supplier-profile`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(DISCOVERABLE_PROFILE);

    expect(res.status).toBe(200);
    expect(res.body.capabilities).toEqual(["WHOLESALER", "DISTRIBUTOR"]);
    expect(res.body.isDiscoverable).toBe(true);
  });

  it("blocks a STAFF member from editing the supplier profile", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Fresh Foods Ltd");
    const staff = await registerAndLogin(app);
    await request(app)
      .post(`/api/organizations/${organizationId}/members`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: staff.email, role: "STAFF" });

    const res = await request(app)
      .put(`/api/organizations/${organizationId}/supplier-profile`)
      .set("Authorization", `Bearer ${staff.accessToken}`)
      .send(DISCOVERABLE_PROFILE);

    expect(res.status).toBe(403);
  });

  it("denies cross-business access to another org's supplier profile", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Fresh Foods Ltd");
    const outsider = await registerAndLogin(app);

    const res = await request(app)
      .get(`/api/organizations/${organizationId}/supplier-profile`)
      .set("Authorization", `Bearer ${outsider.accessToken}`);

    expect(res.status).toBe(403);
  });

  it("records SUPPLIER_PROFILE_CREATED on first save and SUPPLIER_VISIBILITY_CHANGED when discoverability changes", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Fresh Foods Ltd");

    await request(app)
      .put(`/api/organizations/${organizationId}/supplier-profile`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(DISCOVERABLE_PROFILE);

    const { prisma } = await import("../../src/lib/prisma");
    const created = await prisma.auditLog.findFirst({ where: { action: "SUPPLIER_PROFILE_CREATED", organizationId } });
    const visibility = await prisma.auditLog.findFirst({
      where: { action: "SUPPLIER_VISIBILITY_CHANGED", organizationId },
    });
    expect(created).not.toBeNull();
    expect(visibility).not.toBeNull();
  });
});

describe("Business directory discovery", () => {
  it("does not list a business with no supplier profile", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    await createOrg(app, owner, "No Profile Ltd");
    const searcher = await registerAndLogin(app);

    const res = await request(app).get("/api/directory").set("Authorization", `Bearer ${searcher.accessToken}`);
    expect(res.body.organizations).toHaveLength(0);
  });

  it("does not list a business whose profile exists but is not marked discoverable", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Hidden Traders");
    await request(app)
      .put(`/api/organizations/${organizationId}/supplier-profile`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ ...DISCOVERABLE_PROFILE, isDiscoverable: false });
    const searcher = await registerAndLogin(app);

    const res = await request(app).get("/api/directory").set("Authorization", `Bearer ${searcher.accessToken}`);
    expect(res.body.organizations.find((o: { id: string }) => o.id === organizationId)).toBeUndefined();
  });

  it("does not list a business marked inactive even if discoverable", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Inactive Traders");
    await request(app)
      .put(`/api/organizations/${organizationId}/supplier-profile`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ ...DISCOVERABLE_PROFILE, isActive: false });
    const searcher = await registerAndLogin(app);

    const res = await request(app).get("/api/directory").set("Authorization", `Bearer ${searcher.accessToken}`);
    expect(res.body.organizations.find((o: { id: string }) => o.id === organizationId)).toBeUndefined();
  });

  it("lists a fully discoverable business and its detail is fetchable", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Visible Traders Co");
    await request(app)
      .put(`/api/organizations/${organizationId}/supplier-profile`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(DISCOVERABLE_PROFILE);
    const searcher = await registerAndLogin(app);

    const listRes = await request(app).get("/api/directory").set("Authorization", `Bearer ${searcher.accessToken}`);
    expect(listRes.body.organizations.some((o: { id: string }) => o.id === organizationId)).toBe(true);

    const detailRes = await request(app)
      .get(`/api/directory/${organizationId}`)
      .set("Authorization", `Bearer ${searcher.accessToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.legalName).toBe("Visible Traders Co");
    // Privacy: no KYC/membership/internal fields on the public payload
    expect(detailRes.body.verificationStatus).toBeDefined();
    expect(detailRes.body.registrationNumber).toBeUndefined();
    expect(detailRes.body.memberships).toBeUndefined();
    expect(detailRes.body.supplierProfile.isDiscoverable).toBeUndefined();
  });

  it("returns 404 (not 403) for a non-discoverable organization's detail — no enumeration signal", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Not Discoverable Co");
    const searcher = await registerAndLogin(app);

    const res = await request(app)
      .get(`/api/directory/${organizationId}`)
      .set("Authorization", `Bearer ${searcher.accessToken}`);
    expect(res.status).toBe(404);
  });

  it("filters by capability", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Manufacturer Co");
    await request(app)
      .put(`/api/organizations/${organizationId}/supplier-profile`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ ...DISCOVERABLE_PROFILE, capabilities: ["MANUFACTURER"] });
    const searcher = await registerAndLogin(app);

    const res = await request(app)
      .get("/api/directory?capability=MANUFACTURER")
      .set("Authorization", `Bearer ${searcher.accessToken}`);
    expect(res.body.organizations.every((o: { id: string }) => o.id === organizationId)).toBe(true);

    const noMatch = await request(app)
      .get("/api/directory?capability=RETAILER")
      .set("Authorization", `Bearer ${searcher.accessToken}`);
    expect(noMatch.body.organizations.find((o: { id: string }) => o.id === organizationId)).toBeUndefined();
  });

  it("directory search requires authentication", async () => {
    const app = testApp();
    const res = await request(app).get("/api/directory");
    expect(res.status).toBe(401);
  });
});

describe("Admin directory oversight", () => {
  it("blocks a non-admin from admin directory endpoints", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const res = await request(app).get("/api/admin/directory").set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(403);
  });

  it("lets a platform admin list all businesses, including hidden ones, and force-toggle visibility", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Admin View Co");
    await request(app)
      .put(`/api/organizations/${organizationId}/supplier-profile`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ ...DISCOVERABLE_PROFILE, isDiscoverable: false });

    const admin = await registerAndLogin(app);
    await makePlatformAdmin(admin.userId);

    const listRes = await request(app).get("/api/admin/directory").set("Authorization", `Bearer ${admin.accessToken}`);
    expect(listRes.status).toBe(200);
    const entry = listRes.body.organizations.find((o: { id: string }) => o.id === organizationId);
    expect(entry).toBeDefined();
    expect(entry.supplierProfile.isDiscoverable).toBe(false); // admin sees the real flag, unlike public directory

    const toggleRes = await request(app)
      .patch(`/api/admin/directory/${organizationId}/visibility`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ isDiscoverable: true });
    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.isDiscoverable).toBe(true);

    const searcher = await registerAndLogin(app);
    const publicRes = await request(app)
      .get("/api/directory")
      .set("Authorization", `Bearer ${searcher.accessToken}`);
    expect(publicRes.body.organizations.some((o: { id: string }) => o.id === organizationId)).toBe(true);
  });
});
