import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerAndLogin, testApp } from "../helpers";

async function createOrg(app: ReturnType<typeof testApp>, owner: Awaited<ReturnType<typeof registerAndLogin>>) {
  const res = await request(app)
    .post("/api/organizations")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ legalName: "KYC Test Co", businessType: "WHOLESALER" });
  return res.body.organization.id as string;
}

const COMPLETE_PROFILE = {
  contactEmail: "ops@kyctestco.example",
  contactPhone: "+2348012345678",
  addressLine1: "12 Market Street",
  city: "Lagos",
  country: "Nigeria",
};

async function makePlatformAdmin(userId: string) {
  const { prisma } = await import("../../src/lib/prisma");
  await prisma.user.update({ where: { id: userId }, data: { platformRole: "PLATFORM_ADMIN" } });
}

describe("Business profile", () => {
  it("reports onboarding as incomplete with missing fields when nothing has been filled in", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner);

    const res = await request(app)
      .get(`/api/organizations/${organizationId}/onboarding`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.profileComplete).toBe(false);
    expect(res.body.missingFields).toContain("contactEmail");
    expect(res.body.kyc).toBeNull(); // NOT_STARTED — no row exists yet
  });

  it("lets a MANAGER update the profile, and it becomes complete once required fields are filled", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner);

    const patchRes = await request(app)
      .patch(`/api/organizations/${organizationId}/profile`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(COMPLETE_PROFILE);
    expect(patchRes.status).toBe(200);

    const res = await request(app)
      .get(`/api/organizations/${organizationId}/onboarding`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.body.profileComplete).toBe(true);
    expect(res.body.missingFields).toHaveLength(0);
  });

  it("blocks a STAFF member from editing the profile (MANAGER+ only)", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner);
    const staff = await registerAndLogin(app);
    await request(app)
      .post(`/api/organizations/${organizationId}/members`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: staff.email, role: "STAFF" });

    const res = await request(app)
      .patch(`/api/organizations/${organizationId}/profile`)
      .set("Authorization", `Bearer ${staff.accessToken}`)
      .send({ contactEmail: "x@example.com" });

    expect(res.status).toBe(403);
  });

  it("denies cross-business access to onboarding status", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner);
    const outsider = await registerAndLogin(app);

    const res = await request(app)
      .get(`/api/organizations/${organizationId}/onboarding`)
      .set("Authorization", `Bearer ${outsider.accessToken}`);

    expect(res.status).toBe(403);
  });
});

describe("KYC submission", () => {
  it("rejects submission while the profile is incomplete", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner);

    const res = await request(app)
      .post(`/api/organizations/${organizationId}/kyc/submit`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.details.missingFields).toContain("contactEmail");
  });

  it("accepts submission once the profile is complete, moving status to SUBMITTED", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner);
    await request(app)
      .patch(`/api/organizations/${organizationId}/profile`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(COMPLETE_PROFILE);

    const res = await request(app)
      .post(`/api/organizations/${organizationId}/kyc/submit`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("SUBMITTED");

    const onboarding = await request(app)
      .get(`/api/organizations/${organizationId}/onboarding`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(onboarding.body.kyc.status).toBe("SUBMITTED");
  });

  it("rejects a duplicate submission while one is already awaiting review", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner);
    await request(app)
      .patch(`/api/organizations/${organizationId}/profile`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(COMPLETE_PROFILE);
    await request(app)
      .post(`/api/organizations/${organizationId}/kyc/submit`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    const res = await request(app)
      .post(`/api/organizations/${organizationId}/kyc/submit`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(409);
  });
});

describe("Platform-admin KYC review", () => {
  async function submittedOrg(app: ReturnType<typeof testApp>) {
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner);
    await request(app)
      .patch(`/api/organizations/${organizationId}/profile`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(COMPLETE_PROFILE);
    await request(app)
      .post(`/api/organizations/${organizationId}/kyc/submit`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    return { owner, organizationId };
  }

  it("blocks a business OWNER (not a platform admin) from reviewing KYC — no route reaches it", async () => {
    const app = testApp();
    const { owner, organizationId } = await submittedOrg(app);
    const listRes = await request(app)
      .get(`/api/organizations/${organizationId}/onboarding`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    const submissionStatus = listRes.body.kyc.status;
    expect(submissionStatus).toBe("SUBMITTED"); // sanity

    // The owner has no admin route available at all — /api/admin/* requires
    // PLATFORM_ADMIN, which registration never grants.
    const res = await request(app).get("/api/admin/kyc").set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(403);
  });

  it("lets an authorized platform admin list and approve a submission, verifying the organization", async () => {
    const app = testApp();
    const { organizationId } = await submittedOrg(app);
    const admin = await registerAndLogin(app);
    await makePlatformAdmin(admin.userId);

    const listRes = await request(app).get("/api/admin/kyc?status=SUBMITTED").set(
      "Authorization",
      `Bearer ${admin.accessToken}`
    );
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    const submissionId = listRes.body[0].id;

    const detailRes = await request(app)
      .get(`/api/admin/kyc/${submissionId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.organization.contactEmail).toBe(COMPLETE_PROFILE.contactEmail);

    const approveRes = await request(app)
      .patch(`/api/admin/kyc/${submissionId}/review`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ decision: "VERIFIED" });
    expect(approveRes.status).toBe(200);

    const orgRes = await request(app)
      .get(`/api/organizations/${organizationId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .catch(() => null);
    // Admin may not be a member, so fetch via the admin org list instead.
    void orgRes;
    const adminOrgList = await request(app)
      .get("/api/admin/organizations")
      .set("Authorization", `Bearer ${admin.accessToken}`);
    const org = adminOrgList.body.organizations.find((o: { id: string }) => o.id === organizationId);
    expect(org.verificationStatus).toBe("VERIFIED");

    // Real audit event, not just a status change — queried directly since
    // there is no audit-read endpoint yet.
    const { prisma } = await import("../../src/lib/prisma");
    const auditRow = await prisma.auditLog.findFirst({ where: { action: "KYC_APPROVED", targetId: submissionId } });
    expect(auditRow).not.toBeNull();
  });

  it("rejects with a required note, and requires resubmission before it can be reviewed again", async () => {
    const app = testApp();
    const { owner, organizationId } = await submittedOrg(app);
    const admin = await registerAndLogin(app);
    await makePlatformAdmin(admin.userId);
    const listRes = await request(app).get("/api/admin/kyc").set("Authorization", `Bearer ${admin.accessToken}`);
    const submissionId = listRes.body[0].id;

    const missingNote = await request(app)
      .patch(`/api/admin/kyc/${submissionId}/review`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ decision: "REJECTED" });
    expect(missingNote.status).toBe(400); // note required for non-VERIFIED decisions

    const res = await request(app)
      .patch(`/api/admin/kyc/${submissionId}/review`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ decision: "REJECTED", note: "Registration number does not match records" });
    expect(res.status).toBe(200);

    // Reviewing again without resubmission fails — not currently SUBMITTED
    const again = await request(app)
      .patch(`/api/admin/kyc/${submissionId}/review`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ decision: "VERIFIED" });
    expect(again.status).toBe(409);

    // Business resubmits after rejection — allowed
    const resubmit = await request(app)
      .post(`/api/organizations/${organizationId}/kyc/submit`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(resubmit.status).toBe(200);
    expect(resubmit.body.status).toBe("SUBMITTED");
  });

  it("needs-information decision leaves verificationStatus at PENDING, not REJECTED", async () => {
    const app = testApp();
    const { organizationId } = await submittedOrg(app);
    const admin = await registerAndLogin(app);
    await makePlatformAdmin(admin.userId);
    const listRes = await request(app).get("/api/admin/kyc").set("Authorization", `Bearer ${admin.accessToken}`);
    const submissionId = listRes.body[0].id;

    const res = await request(app)
      .patch(`/api/admin/kyc/${submissionId}/review`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ decision: "NEEDS_INFORMATION", note: "Please confirm registered address" });
    expect(res.status).toBe(200);

    const adminOrgList = await request(app)
      .get("/api/admin/organizations")
      .set("Authorization", `Bearer ${admin.accessToken}`);
    const org = adminOrgList.body.organizations.find((o: { id: string }) => o.id === organizationId);
    expect(org.verificationStatus).toBe("PENDING");
  });
});
