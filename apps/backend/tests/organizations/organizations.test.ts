import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerAndLogin, testApp } from "../helpers";

async function createOrg(app: ReturnType<typeof testApp>, accessToken: string, legalName = "Acme Foods") {
  const res = await request(app)
    .post("/api/organizations")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ legalName, businessType: "PRODUCER_MANUFACTURER" });
  return res;
}

describe("POST /api/organizations", () => {
  it("creates an organization and makes the creator its OWNER", async () => {
    const app = testApp();
    const { accessToken } = await registerAndLogin(app);

    const res = await createOrg(app, accessToken);

    expect(res.status).toBe(201);
    expect(res.body.organization.legalName).toBe("Acme Foods");
    expect(res.body.organization.businessType).toBe("PRODUCER_MANUFACTURER");
    expect(res.body.organization.verificationStatus).toBe("PENDING");

    const membersRes = await request(app)
      .get(`/api/organizations/${res.body.organization.id}/members`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(membersRes.status).toBe(200);
    expect(membersRes.body.members).toHaveLength(1);
    expect(membersRes.body.members[0].role).toBe("OWNER");
  });

  it("rejects an invalid business type", async () => {
    const app = testApp();
    const { accessToken } = await registerAndLogin(app);

    const res = await request(app)
      .post("/api/organizations")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ legalName: "Bad Co", businessType: "DISTRIBUTOR" });

    expect(res.status).toBe(400);
  });

  it("requires authentication", async () => {
    const app = testApp();
    const res = await request(app)
      .post("/api/organizations")
      .send({ legalName: "No Auth Co", businessType: "RETAILER" });
    expect(res.status).toBe(401);
  });
});

describe("Organization isolation", () => {
  it("denies a user from Organization A access to Organization B's resources", async () => {
    const app = testApp();
    const userA = await registerAndLogin(app);
    const userB = await registerAndLogin(app);

    const orgBRes = await createOrg(app, userB.accessToken, "Org B Ltd");
    const orgBId = orgBRes.body.organization.id;

    const getRes = await request(app)
      .get(`/api/organizations/${orgBId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);
    expect(getRes.status).toBe(403);

    const membersRes = await request(app)
      .get(`/api/organizations/${orgBId}/members`)
      .set("Authorization", `Bearer ${userA.accessToken}`);
    expect(membersRes.status).toBe(403);

    const patchRes = await request(app)
      .patch(`/api/organizations/${orgBId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ legalName: "Hijacked Name" });
    expect(patchRes.status).toBe(403);
  });

  it("allows a member to access their own organization", async () => {
    const app = testApp();
    const { accessToken } = await registerAndLogin(app);
    const orgRes = await createOrg(app, accessToken);

    const getRes = await request(app)
      .get(`/api/organizations/${orgRes.body.organization.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.organization.id).toBe(orgRes.body.organization.id);
  });

  it("returns 403 (not 404) for a nonexistent organization to avoid leaking existence", async () => {
    const app = testApp();
    const { accessToken } = await registerAndLogin(app);

    const res = await request(app)
      .get("/api/organizations/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
  });
});
