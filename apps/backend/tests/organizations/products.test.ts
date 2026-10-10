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

describe("Product ownership", () => {
  it("lets a MANAGER create a product for their own organization", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Rice Traders Ltd");

    const res = await request(app)
      .post(`/api/organizations/${organizationId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Bag of Rice 50kg", description: "Premium parboiled rice" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.isDiscoverable).toBe(false);
  });

  it("blocks a STAFF member from creating a product", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Rice Traders Ltd");
    const staff = await registerAndLogin(app);
    await request(app)
      .post(`/api/organizations/${organizationId}/members`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: staff.email, role: "STAFF" });

    const res = await request(app)
      .post(`/api/organizations/${organizationId}/products`)
      .set("Authorization", `Bearer ${staff.accessToken}`)
      .send({ name: "Bag of Rice 50kg" });

    expect(res.status).toBe(403);
  });

  it("blocks an unauthenticated request entirely", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Rice Traders Ltd");

    const res = await request(app)
      .post(`/api/organizations/${organizationId}/products`)
      .send({ name: "Bag of Rice 50kg" });

    expect(res.status).toBe(401);
  });

  it("cannot modify another organization's product, and cannot even read it via the owner-scoped route", async () => {
    const app = testApp();
    const ownerA = await registerAndLogin(app);
    const orgA = await createOrg(app, ownerA, "Org A");
    const createRes = await request(app)
      .post(`/api/organizations/${orgA}/products`)
      .set("Authorization", `Bearer ${ownerA.accessToken}`)
      .send({ name: "Org A Product" });
    const productId = createRes.body.id;

    const ownerB = await registerAndLogin(app);
    const orgB = await createOrg(app, ownerB, "Org B");

    const readRes = await request(app)
      .get(`/api/organizations/${orgB}/products/${productId}`)
      .set("Authorization", `Bearer ${ownerB.accessToken}`);
    expect(readRes.status).toBe(404); // not found under org B's scope, correctly

    const writeRes = await request(app)
      .patch(`/api/organizations/${orgB}/products/${productId}`)
      .set("Authorization", `Bearer ${ownerB.accessToken}`)
      .send({ name: "Hijacked" });
    expect(writeRes.status).toBe(404);
  });
});

describe("Product lifecycle", () => {
  async function createDraft(app: ReturnType<typeof testApp>) {
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Lifecycle Co");
    const createRes = await request(app)
      .post(`/api/organizations/${organizationId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Test Product" });
    return { owner, organizationId, productId: createRes.body.id as string };
  }

  it("starts as DRAFT and not discoverable", async () => {
    const app = testApp();
    const { owner, organizationId, productId } = await createDraft(app);
    const res = await request(app)
      .get(`/api/organizations/${organizationId}/products/${productId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.isDiscoverable).toBe(false);
  });

  it("moves through ACTIVE -> INACTIVE -> ARCHIVED without ever being deleted", async () => {
    const app = testApp();
    const { owner, organizationId, productId } = await createDraft(app);

    const activate = await request(app)
      .patch(`/api/organizations/${organizationId}/products/${productId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "ACTIVE", isDiscoverable: true });
    expect(activate.body.status).toBe("ACTIVE");

    const deactivate = await request(app)
      .patch(`/api/organizations/${organizationId}/products/${productId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "INACTIVE" });
    expect(deactivate.body.status).toBe("INACTIVE");

    const archive = await request(app)
      .patch(`/api/organizations/${organizationId}/products/${productId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "ARCHIVED" });
    expect(archive.status).toBe(200);
    expect(archive.body.status).toBe("ARCHIVED");

    // Still readable via the owner route -- never hard-deleted
    const stillThere = await request(app)
      .get(`/api/organizations/${organizationId}/products/${productId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(stillThere.status).toBe(200);
  });
});

describe("Product discovery", () => {
  async function setupProduct(
    app: ReturnType<typeof testApp>,
    overrides: Record<string, unknown> = {}
  ) {
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, `Discovery Co ${Math.random()}`);
    const createRes = await request(app)
      .post(`/api/organizations/${organizationId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Discoverable Widget", brand: "Acme" });
    const productId = createRes.body.id;
    await request(app)
      .patch(`/api/organizations/${organizationId}/products/${productId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "ACTIVE", isDiscoverable: true, ...overrides });
    return { owner, organizationId, productId };
  }

  it("shows a discoverable ACTIVE product in public search", async () => {
    const app = testApp();
    const { productId } = await setupProduct(app);
    const searcher = await registerAndLogin(app);

    const res = await request(app).get("/api/products").set("Authorization", `Bearer ${searcher.accessToken}`);
    expect(res.body.products.some((p: { id: string }) => p.id === productId)).toBe(true);
  });

  it("does not show a DRAFT product even if isDiscoverable is somehow true", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Draft Co");
    const createRes = await request(app)
      .post(`/api/organizations/${organizationId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Still Draft" });
    await request(app)
      .patch(`/api/organizations/${organizationId}/products/${createRes.body.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ isDiscoverable: true }); // status stays DRAFT

    const searcher = await registerAndLogin(app);
    const res = await request(app).get("/api/products").set("Authorization", `Bearer ${searcher.accessToken}`);
    expect(res.body.products.find((p: { id: string }) => p.id === createRes.body.id)).toBeUndefined();
  });

  it("does not show a hidden (isDiscoverable=false) ACTIVE product", async () => {
    const app = testApp();
    const { productId } = await setupProduct(app, { isDiscoverable: false });
    const searcher = await registerAndLogin(app);

    const res = await request(app).get("/api/products").set("Authorization", `Bearer ${searcher.accessToken}`);
    expect(res.body.products.find((p: { id: string }) => p.id === productId)).toBeUndefined();
  });

  it("search matches by name, and organization filter works", async () => {
    const app = testApp();
    const { productId, organizationId } = await setupProduct(app);
    const searcher = await registerAndLogin(app);

    const nameSearch = await request(app)
      .get("/api/products?search=Widget")
      .set("Authorization", `Bearer ${searcher.accessToken}`);
    expect(nameSearch.body.products.some((p: { id: string }) => p.id === productId)).toBe(true);

    const orgFilter = await request(app)
      .get(`/api/products?organizationId=${organizationId}`)
      .set("Authorization", `Bearer ${searcher.accessToken}`);
    expect(orgFilter.body.products.every((p: { id: string }) => p.id === productId)).toBe(true);

    const noMatch = await request(app)
      .get("/api/products?search=NoSuchThing")
      .set("Authorization", `Bearer ${searcher.accessToken}`);
    expect(noMatch.body.products).toHaveLength(0);
  });

  it("returns 404 (not 403) for a hidden product's public detail — no enumeration signal", async () => {
    const app = testApp();
    const { productId } = await setupProduct(app, { isDiscoverable: false });
    const searcher = await registerAndLogin(app);

    const res = await request(app)
      .get(`/api/products/${productId}`)
      .set("Authorization", `Bearer ${searcher.accessToken}`);
    expect(res.status).toBe(404);
  });

  it("public detail excludes organization-private fields", async () => {
    const app = testApp();
    const { productId } = await setupProduct(app);
    const searcher = await registerAndLogin(app);

    const res = await request(app)
      .get(`/api/products/${productId}`)
      .set("Authorization", `Bearer ${searcher.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.organization.legalName).toBeDefined();
    expect(res.body.organization.registrationNumber).toBeUndefined();
    expect(res.body.organization.contactEmail).toBeUndefined();
  });

  it("public discovery requires authentication", async () => {
    const app = testApp();
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(401);
  });
});

describe("Product audit events", () => {
  it("records PRODUCT_CREATED, PRODUCT_STATUS_CHANGED, and PRODUCT_VISIBILITY_CHANGED", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Audit Co");
    const createRes = await request(app)
      .post(`/api/organizations/${organizationId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Audited Product" });
    const productId = createRes.body.id;

    await request(app)
      .patch(`/api/organizations/${organizationId}/products/${productId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "ACTIVE", isDiscoverable: true });

    const { prisma } = await import("../../src/lib/prisma");
    const created = await prisma.auditLog.findFirst({ where: { action: "PRODUCT_CREATED", targetId: productId } });
    const statusChanged = await prisma.auditLog.findFirst({
      where: { action: "PRODUCT_STATUS_CHANGED", targetId: productId },
    });
    const visibilityChanged = await prisma.auditLog.findFirst({
      where: { action: "PRODUCT_VISIBILITY_CHANGED", targetId: productId },
    });
    expect(created).not.toBeNull();
    expect(statusChanged).not.toBeNull();
    expect(visibilityChanged).not.toBeNull();
  });
});

describe("Platform-admin product oversight", () => {
  it("blocks a non-admin from the admin products list", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const res = await request(app).get("/api/admin/products").set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(403);
  });

  it("lets a platform admin list all products, including drafts and hidden ones", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner, "Admin View Co");
    await request(app)
      .post(`/api/organizations/${organizationId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Still A Draft" });

    const admin = await registerAndLogin(app);
    await makePlatformAdmin(admin.userId);
    const res = await request(app).get("/api/admin/products").set("Authorization", `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.products.some((p: { name: string }) => p.name === "Still A Draft")).toBe(true);
  });
});

describe("Categories", () => {
  it("lists the seeded categories for authenticated users", async () => {
    const app = testApp();
    const user = await registerAndLogin(app);
    const res = await request(app).get("/api/categories").set("Authorization", `Bearer ${user.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some((c: { slug: string }) => c.slug === "food-beverage")).toBe(true);
  });
});
