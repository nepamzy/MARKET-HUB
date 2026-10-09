import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { promoteToDriver, registerAndLogin, testApp } from "../helpers";
import { createDispatchedDelivery } from "./helpers";

async function registerDriver(app: ReturnType<typeof testApp>) {
  const driver = await registerAndLogin(app);
  await promoteToDriver(driver.userId);
  return driver;
}

describe("Delivery — driver assignment", () => {
  it("lets a seller MANAGER+ assign an existing driver by email", async () => {
    const app = testApp();
    const { seller, deliveryId } = await createDispatchedDelivery(app);
    const driver = await registerDriver(app);

    const res = await request(app)
      .post(`/api/deliveries/${deliveryId}/assign-driver`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`)
      .send({ driverEmail: driver.email });

    expect(res.status).toBe(200);
    expect(res.body.delivery.driverUser.id).toBe(driver.userId);
    expect(res.body.delivery.assignedAt).not.toBeNull();

    const events = await prisma.deliveryEvent.findMany({ where: { deliveryId, type: "DRIVER_ASSIGNED" } });
    expect(events).toHaveLength(1);
  });

  it("rejects assigning a user whose platformRole is not DRIVER", async () => {
    const app = testApp();
    const { seller, deliveryId } = await createDispatchedDelivery(app);
    const notADriver = await registerAndLogin(app);

    const res = await request(app)
      .post(`/api/deliveries/${deliveryId}/assign-driver`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`)
      .send({ driverEmail: notADriver.email });

    expect(res.status).toBe(400);
  });

  it("rejects assigning an email with no matching account", async () => {
    const app = testApp();
    const { seller, deliveryId } = await createDispatchedDelivery(app);

    const res = await request(app)
      .post(`/api/deliveries/${deliveryId}/assign-driver`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`)
      .send({ driverEmail: "nobody@example.com" });

    expect(res.status).toBe(400);
  });

  it("denies a STAFF member from assigning a driver (MANAGER+ only)", async () => {
    const app = testApp();
    const { seller, deliveryId } = await createDispatchedDelivery(app);
    const staff = await registerAndLogin(app);
    await prisma.organizationMembership.create({ data: { organizationId: seller.organizationId, userId: staff.userId, role: "STAFF" } });
    const driver = await registerDriver(app);

    const res = await request(app)
      .post(`/api/deliveries/${deliveryId}/assign-driver`)
      .set("Authorization", `Bearer ${staff.accessToken}`)
      .send({ driverEmail: driver.email });

    expect(res.status).toBe(404);
  });

  it("admin driver-role endpoint grants and revokes DRIVER, never touches PLATFORM_ADMIN", async () => {
    const app = testApp();
    const { userId: adminUserId, accessToken: adminToken } = await registerAndLogin(app);
    await prisma.user.update({ where: { id: adminUserId }, data: { platformRole: "PLATFORM_ADMIN" } });
    const target = await registerAndLogin(app);

    const grant = await request(app)
      .patch(`/api/admin/users/${target.userId}/driver-role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isDriver: true });
    expect(grant.status).toBe(200);
    expect(grant.body.user.platformRole).toBe("DRIVER");

    const revoke = await request(app)
      .patch(`/api/admin/users/${target.userId}/driver-role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isDriver: false });
    expect(revoke.status).toBe(200);
    expect(revoke.body.user.platformRole).toBe("CUSTOMER");

    const protectAdmin = await request(app)
      .patch(`/api/admin/users/${adminUserId}/driver-role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isDriver: true });
    expect(protectAdmin.status).toBe(409);
  });
});

describe("Delivery — driver authorization and pickup", () => {
  it("lets the assigned driver mark the delivery picked up, denies any other driver", async () => {
    const app = testApp();
    const { seller, deliveryId } = await createDispatchedDelivery(app);
    const driver = await registerDriver(app);
    await request(app).post(`/api/deliveries/${deliveryId}/assign-driver`).set("Authorization", `Bearer ${seller.owner.accessToken}`).send({ driverEmail: driver.email });

    const otherDriver = await registerDriver(app);
    const deniedRes = await request(app).post(`/api/deliveries/${deliveryId}/pickup`).set("Authorization", `Bearer ${otherDriver.accessToken}`);
    expect(deniedRes.status).toBe(404); // a driver must never learn a delivery assigned to someone else exists

    const res = await request(app).post(`/api/deliveries/${deliveryId}/pickup`).set("Authorization", `Bearer ${driver.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.delivery.status).toBe("IN_TRANSIT");
    expect(res.body.delivery.pickedUpAt).not.toBeNull();
  });

  it("requires platformRole DRIVER for the pickup endpoint at all", async () => {
    const app = testApp();
    const { seller, deliveryId } = await createDispatchedDelivery(app);
    const driver = await registerDriver(app);
    await request(app).post(`/api/deliveries/${deliveryId}/assign-driver`).set("Authorization", `Bearer ${seller.owner.accessToken}`).send({ driverEmail: driver.email });
    // Demote back to CUSTOMER mid-flow to prove the role check is real, not just the assignment check.
    await prisma.user.update({ where: { id: driver.userId }, data: { platformRole: "CUSTOMER" } });

    const res = await request(app).post(`/api/deliveries/${deliveryId}/pickup`).set("Authorization", `Bearer ${driver.accessToken}`);
    expect(res.status).toBe(403);
  });
});

describe("Delivery — live location tracking", () => {
  async function assignedAndPickedUp(app: ReturnType<typeof testApp>) {
    const ctx = await createDispatchedDelivery(app);
    const driver = await registerDriver(app);
    await request(app).post(`/api/deliveries/${ctx.deliveryId}/assign-driver`).set("Authorization", `Bearer ${ctx.seller.owner.accessToken}`).send({ driverEmail: driver.email });
    await request(app).post(`/api/deliveries/${ctx.deliveryId}/pickup`).set("Authorization", `Bearer ${driver.accessToken}`);
    return { ...ctx, driver };
  }

  it("shows an honest empty state before any location update", async () => {
    const app = testApp();
    const { seller, deliveryId } = await createDispatchedDelivery(app);

    const res = await request(app).get(`/api/deliveries/${deliveryId}/location`).set("Authorization", `Bearer ${seller.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.location).toBeNull();
  });

  it("the assigned driver can record a real coordinate once IN_TRANSIT; it is immediately visible and not stale", async () => {
    const app = testApp();
    const { seller, buyer, deliveryId, driver } = await assignedAndPickedUp(app);

    const post = await request(app).post(`/api/deliveries/${deliveryId}/location`).set("Authorization", `Bearer ${driver.accessToken}`).send({ latitude: 6.5244, longitude: 3.3792 });
    expect(post.status).toBe(201);

    const sellerView = await request(app).get(`/api/deliveries/${deliveryId}/location`).set("Authorization", `Bearer ${seller.owner.accessToken}`);
    expect(sellerView.body.location.latitude).toBe(6.5244);
    expect(sellerView.body.location.stale).toBe(false);

    const buyerView = await request(app).get(`/api/deliveries/${deliveryId}/location`).set("Authorization", `Bearer ${buyer.accessToken}`);
    expect(buyerView.status).toBe(200);
    expect(buyerView.body.location.longitude).toBe(3.3792);
  });

  it("rejects an out-of-range coordinate", async () => {
    const app = testApp();
    const { deliveryId, driver } = await assignedAndPickedUp(app);

    const res = await request(app).post(`/api/deliveries/${deliveryId}/location`).set("Authorization", `Bearer ${driver.accessToken}`).send({ latitude: 999, longitude: 3.3792 });

    expect(res.status).toBe(400);
  });

  it("rejects a location update before pickup (PENDING_PICKUP)", async () => {
    const app = testApp();
    const { seller, deliveryId } = await createDispatchedDelivery(app);
    const driver = await registerDriver(app);
    await request(app).post(`/api/deliveries/${deliveryId}/assign-driver`).set("Authorization", `Bearer ${seller.owner.accessToken}`).send({ driverEmail: driver.email });

    const res = await request(app).post(`/api/deliveries/${deliveryId}/location`).set("Authorization", `Bearer ${driver.accessToken}`).send({ latitude: 6.5, longitude: 3.3 });

    expect(res.status).toBe(409);
  });

  it("denies an unassigned driver from posting a location — a delivery not assigned to them does not exist to them", async () => {
    const app = testApp();
    const { deliveryId } = await assignedAndPickedUp(app);
    const otherDriver = await registerDriver(app);

    const res = await request(app).post(`/api/deliveries/${deliveryId}/location`).set("Authorization", `Bearer ${otherDriver.accessToken}`).send({ latitude: 6.5, longitude: 3.3 });

    expect(res.status).toBe(404);
  });

  it("denies a non-party from reading the location at all", async () => {
    const app = testApp();
    const { deliveryId, driver } = await assignedAndPickedUp(app);
    await request(app).post(`/api/deliveries/${deliveryId}/location`).set("Authorization", `Bearer ${driver.accessToken}`).send({ latitude: 6.5, longitude: 3.3 });
    const stranger = await registerAndLogin(app);

    const res = await request(app).get(`/api/deliveries/${deliveryId}/location`).set("Authorization", `Bearer ${stranger.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("reports a location older than the freshness window as stale", async () => {
    const app = testApp();
    const { seller, deliveryId, driver } = await assignedAndPickedUp(app);
    await request(app).post(`/api/deliveries/${deliveryId}/location`).set("Authorization", `Bearer ${driver.accessToken}`).send({ latitude: 6.5, longitude: 3.3 });
    await prisma.driverLocationUpdate.updateMany({ where: { deliveryId }, data: { recordedAt: new Date(Date.now() - 20 * 60 * 1000) } });

    const res = await request(app).get(`/api/deliveries/${deliveryId}/location`).set("Authorization", `Bearer ${seller.owner.accessToken}`);

    expect(res.body.location.stale).toBe(true);
  });
});

describe("Delivery — proof of delivery", () => {
  async function assignedAndPickedUp(app: ReturnType<typeof testApp>) {
    const ctx = await createDispatchedDelivery(app);
    const driver = await registerDriver(app);
    await request(app).post(`/api/deliveries/${ctx.deliveryId}/assign-driver`).set("Authorization", `Bearer ${ctx.seller.owner.accessToken}`).send({ driverEmail: driver.email });
    await request(app).post(`/api/deliveries/${ctx.deliveryId}/pickup`).set("Authorization", `Bearer ${driver.accessToken}`);
    return { ...ctx, driver };
  }

  it("the assigned driver can confirm proof of delivery, transitioning to DELIVERED", async () => {
    const app = testApp();
    const { deliveryId, driver } = await assignedAndPickedUp(app);

    const res = await request(app)
      .post(`/api/deliveries/${deliveryId}/proof-of-delivery`)
      .set("Authorization", `Bearer ${driver.accessToken}`)
      .send({ recipientName: "Jane Receiver", notes: "Left with the gate security" });

    expect(res.status).toBe(200);
    expect(res.body.delivery.status).toBe("DELIVERED");
    expect(res.body.delivery.deliveredAt).not.toBeNull();

    const pod = await prisma.proofOfDelivery.findUnique({ where: { deliveryId } });
    expect(pod?.recipientName).toBe("Jane Receiver");

    const audit = await prisma.auditLog.findMany({ where: { targetId: deliveryId, action: "DELIVERY_DELIVERED" } });
    expect(audit).toHaveLength(1);
  });

  it("denies the buyer from confirming proof of delivery themselves", async () => {
    const app = testApp();
    const { buyer, deliveryId } = await assignedAndPickedUp(app);

    const res = await request(app).post(`/api/deliveries/${deliveryId}/proof-of-delivery`).set("Authorization", `Bearer ${buyer.accessToken}`).send({});

    expect(res.status).toBe(403); // buyer has no DRIVER platformRole at all
  });

  it("denies an unassigned driver from confirming proof of delivery", async () => {
    const app = testApp();
    const { deliveryId } = await assignedAndPickedUp(app);
    const otherDriver = await registerDriver(app);

    const res = await request(app).post(`/api/deliveries/${deliveryId}/proof-of-delivery`).set("Authorization", `Bearer ${otherDriver.accessToken}`).send({});

    expect(res.status).toBe(404);
  });

  it("rejects confirming proof of delivery before pickup", async () => {
    const app = testApp();
    const { seller, deliveryId } = await createDispatchedDelivery(app);
    const driver = await registerDriver(app);
    await request(app).post(`/api/deliveries/${deliveryId}/assign-driver`).set("Authorization", `Bearer ${seller.owner.accessToken}`).send({ driverEmail: driver.email });

    const res = await request(app).post(`/api/deliveries/${deliveryId}/proof-of-delivery`).set("Authorization", `Bearer ${driver.accessToken}`).send({});

    expect(res.status).toBe(409);
  });

  it("never creates a second completion record on a duplicate confirm — same driver, retried", async () => {
    const app = testApp();
    const { deliveryId, driver } = await assignedAndPickedUp(app);

    const first = await request(app).post(`/api/deliveries/${deliveryId}/proof-of-delivery`).set("Authorization", `Bearer ${driver.accessToken}`).send({});
    expect(first.status).toBe(200);
    const second = await request(app).post(`/api/deliveries/${deliveryId}/proof-of-delivery`).set("Authorization", `Bearer ${driver.accessToken}`).send({});
    expect(second.status).toBe(200);
    expect(second.body.delivery.status).toBe("DELIVERED");

    expect(await prisma.proofOfDelivery.count({ where: { deliveryId } })).toBe(1);
    const auditEntries = await prisma.auditLog.findMany({ where: { targetId: deliveryId, action: "DELIVERY_DELIVERED" } });
    expect(auditEntries).toHaveLength(1); // only the first call actually recorded anything
  });
});

describe("Delivery — failed delivery handling", () => {
  it("a driver can mark IN_TRANSIT as FAILED, recording the reason and an audit event", async () => {
    const app = testApp();
    const ctx = await createDispatchedDelivery(app);
    const driver = await registerDriver(app);
    await request(app).post(`/api/deliveries/${ctx.deliveryId}/assign-driver`).set("Authorization", `Bearer ${ctx.seller.owner.accessToken}`).send({ driverEmail: driver.email });
    await request(app).post(`/api/deliveries/${ctx.deliveryId}/pickup`).set("Authorization", `Bearer ${driver.accessToken}`);

    const res = await request(app).post(`/api/deliveries/${ctx.deliveryId}/fail`).set("Authorization", `Bearer ${driver.accessToken}`).send({ reason: "Recipient unreachable after three attempts" });

    expect(res.status).toBe(200);
    expect(res.body.delivery.status).toBe("FAILED");
    expect(res.body.delivery.failureReason).toBe("Recipient unreachable after three attempts");

    const audit = await prisma.auditLog.findMany({ where: { targetId: ctx.deliveryId, action: "DELIVERY_FAILED" } });
    expect(audit).toHaveLength(1);
  });

  it("the seller MANAGER+ can also mark a delivery failed when the driver is unreachable", async () => {
    const app = testApp();
    const ctx = await createDispatchedDelivery(app);

    const res = await request(app).post(`/api/deliveries/${ctx.deliveryId}/fail`).set("Authorization", `Bearer ${ctx.seller.owner.accessToken}`).send({ reason: "Driver unreachable" });

    expect(res.status).toBe(200);
    expect(res.body.delivery.status).toBe("FAILED");
  });

  it("rejects marking an already-DELIVERED delivery as failed", async () => {
    const app = testApp();
    const ctx = await createDispatchedDelivery(app);
    const driver = await registerDriver(app);
    await request(app).post(`/api/deliveries/${ctx.deliveryId}/assign-driver`).set("Authorization", `Bearer ${ctx.seller.owner.accessToken}`).send({ driverEmail: driver.email });
    await request(app).post(`/api/deliveries/${ctx.deliveryId}/pickup`).set("Authorization", `Bearer ${driver.accessToken}`);
    await request(app).post(`/api/deliveries/${ctx.deliveryId}/proof-of-delivery`).set("Authorization", `Bearer ${driver.accessToken}`).send({});

    const res = await request(app).post(`/api/deliveries/${ctx.deliveryId}/fail`).set("Authorization", `Bearer ${driver.accessToken}`).send({ reason: "Too late" });

    expect(res.status).toBe(409);
  });
});

describe("Delivery — driver's own assigned-deliveries view", () => {
  it("lists only this driver's own assigned deliveries, never another driver's", async () => {
    const app = testApp();
    const ctxA = await createDispatchedDelivery(app);
    const ctxB = await createDispatchedDelivery(app);
    const driver = await registerDriver(app);
    await request(app).post(`/api/deliveries/${ctxA.deliveryId}/assign-driver`).set("Authorization", `Bearer ${ctxA.seller.owner.accessToken}`).send({ driverEmail: driver.email });
    // ctxB's delivery is assigned to a different driver entirely.
    const otherDriver = await registerDriver(app);
    await request(app).post(`/api/deliveries/${ctxB.deliveryId}/assign-driver`).set("Authorization", `Bearer ${ctxB.seller.owner.accessToken}`).send({ driverEmail: otherDriver.email });

    const res = await request(app).get("/api/driver/deliveries").set("Authorization", `Bearer ${driver.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.deliveries).toHaveLength(1);
    expect(res.body.deliveries[0].id).toBe(ctxA.deliveryId);
  });

  it("requires platformRole DRIVER", async () => {
    const app = testApp();
    const regular = await registerAndLogin(app);

    const res = await request(app).get("/api/driver/deliveries").set("Authorization", `Bearer ${regular.accessToken}`);

    expect(res.status).toBe(403);
  });
});

describe("Delivery — sender/receiver access and privacy", () => {
  it("seller (sender) and buyer (receiver) can both view the delivery; a stranger cannot", async () => {
    const app = testApp();
    const { seller, buyer, deliveryId } = await createDispatchedDelivery(app);

    const sellerView = await request(app).get(`/api/deliveries/${deliveryId}`).set("Authorization", `Bearer ${seller.owner.accessToken}`);
    expect(sellerView.status).toBe(200);
    expect(sellerView.body.delivery.viewerRole).toBe("seller");

    const buyerView = await request(app).get(`/api/deliveries/${deliveryId}`).set("Authorization", `Bearer ${buyer.accessToken}`);
    expect(buyerView.status).toBe(200);
    expect(buyerView.body.delivery.viewerRole).toBe("buyer");

    const stranger = await registerAndLogin(app);
    const strangerView = await request(app).get(`/api/deliveries/${deliveryId}`).set("Authorization", `Bearer ${stranger.accessToken}`);
    expect(strangerView.status).toBe(404);
  });

  it("never exposes the recipient's destination/phone to a non-party", async () => {
    const app = testApp();
    const { deliveryId } = await createDispatchedDelivery(app);
    const stranger = await registerAndLogin(app);

    const res = await request(app).get(`/api/deliveries/${deliveryId}`).set("Authorization", `Bearer ${stranger.accessToken}`);

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain("Jane Receiver");
  });
});
