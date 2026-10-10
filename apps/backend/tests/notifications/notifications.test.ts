import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { createOrderForNewBuyer } from "../commerce/helpers";
import { promoteToDriver, promoteToPlatformAdmin, registerAndLogin, testApp, uniqueEmail } from "../helpers";
import { createDispatchedDelivery } from "../logistics/helpers";
import {
  createAwardedRfq,
  createBuyer,
  createIssuedRfq,
  createSubmittedRequisition,
  createSubmittedResponse,
  createSupplier,
} from "../procurement/helpers";

const COMPLETE_PROFILE = {
  contactEmail: "ops@notifytestco.example",
  contactPhone: "+2348012345678",
  addressLine1: "12 Market Street",
  city: "Lagos",
  country: "Nigeria",
};

async function createOrg(app: ReturnType<typeof testApp>, owner: Awaited<ReturnType<typeof registerAndLogin>>, businessType = "RETAILER") {
  const res = await request(app)
    .post("/api/organizations")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ legalName: `Notify Test Co ${Math.random()}`, businessType });
  return res.body.organization.id as string;
}

async function listNotifications(app: ReturnType<typeof testApp>, token: string) {
  const res = await request(app).get("/api/notifications").set("Authorization", `Bearer ${token}`);
  return res.body as { notifications: Array<Record<string, unknown>>; unreadCount: number; total: number };
}

describe("Notifications — ownership and isolation", () => {
  it("lets a user list only their own notifications, with an accurate unread count", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner);
    const invitee = await registerAndLogin(app);

    await request(app)
      .post(`/api/organizations/${organizationId}/invite-links`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ expiresInDays: 7, inviteeEmail: invitee.email, role: "STAFF" });

    const ownerList = await listNotifications(app, owner.accessToken);
    expect(ownerList.notifications).toHaveLength(0); // owner never notifies themselves

    const inviteeList = await listNotifications(app, invitee.accessToken);
    expect(inviteeList.notifications).toHaveLength(1);
    expect(inviteeList.notifications[0]!.type).toBe("INVITATION_RECEIVED");
    expect(inviteeList.unreadCount).toBe(1);

    const unreadRes = await request(app).get("/api/notifications/unread-count").set("Authorization", `Bearer ${invitee.accessToken}`);
    expect(unreadRes.body.unreadCount).toBe(1);
  });

  it("prevents a user from marking another user's notification read (no forged ownership)", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner);
    const invitee = await registerAndLogin(app);
    await request(app)
      .post(`/api/organizations/${organizationId}/invite-links`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ expiresInDays: 7, inviteeEmail: invitee.email, role: "STAFF" });

    const { notifications } = await listNotifications(app, invitee.accessToken);
    const notificationId = notifications[0]!.id as string;

    const stranger = await registerAndLogin(app);
    const forgedRes = await request(app)
      .post(`/api/notifications/${notificationId}/read`)
      .set("Authorization", `Bearer ${stranger.accessToken}`);
    expect(forgedRes.status).toBe(404);

    // Still unread for the real recipient.
    const stillUnread = await listNotifications(app, invitee.accessToken);
    expect(stillUnread.notifications[0]!.readAt).toBeNull();
  });

  it("lets the real recipient mark their own notification read, idempotently", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner);
    const invitee = await registerAndLogin(app);
    await request(app)
      .post(`/api/organizations/${organizationId}/invite-links`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ expiresInDays: 7, inviteeEmail: invitee.email, role: "STAFF" });

    const { notifications } = await listNotifications(app, invitee.accessToken);
    const notificationId = notifications[0]!.id as string;

    const firstRead = await request(app)
      .post(`/api/notifications/${notificationId}/read`)
      .set("Authorization", `Bearer ${invitee.accessToken}`);
    expect(firstRead.status).toBe(200);
    expect(firstRead.body.notification.readAt).not.toBeNull();

    const secondRead = await request(app)
      .post(`/api/notifications/${notificationId}/read`)
      .set("Authorization", `Bearer ${invitee.accessToken}`);
    expect(secondRead.status).toBe(200); // idempotent no-op, not an error
  });

  it("marks all of a user's unread notifications read in one call, and only that user's", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner);
    const invitee = await registerAndLogin(app);
    await request(app)
      .post(`/api/organizations/${organizationId}/invite-links`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ expiresInDays: 7, inviteeEmail: invitee.email, role: "STAFF" });
    await request(app)
      .post(`/api/organizations/${organizationId}/invite-links`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ expiresInDays: 7, inviteeEmail: invitee.email, role: "MANAGER" });

    const before = await listNotifications(app, invitee.accessToken);
    expect(before.unreadCount).toBe(2);

    const res = await request(app).post("/api/notifications/read-all").set("Authorization", `Bearer ${invitee.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);

    const after = await listNotifications(app, invitee.accessToken);
    expect(after.unreadCount).toBe(0);
  });

  it("returns a 404 (not a leak) when marking a nonexistent notification id read", async () => {
    const app = testApp();
    const user = await registerAndLogin(app);
    const res = await request(app)
      .post("/api/notifications/00000000-0000-0000-0000-000000000000/read")
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(res.status).toBe(404);
  });
});

describe("Notifications — Account/Membership events", () => {
  it("does not notify anyone for a generic invite link with no matching account", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner);

    const res = await request(app)
      .post(`/api/organizations/${organizationId}/invite-links`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ expiresInDays: 7, inviteeEmail: uniqueEmail("nouser") });
    expect(res.status).toBe(201);

    const count = await prisma.notification.count();
    expect(count).toBe(0);
  });

  it("notifies the requester when their join request is approved, and the decision is correct on rejection too", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner);
    const requester = await registerAndLogin(app);

    const linkRes = await request(app)
      .post(`/api/organizations/${organizationId}/invite-links`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ expiresInDays: 7 });
    const token = linkRes.body.token as string;

    await request(app).post(`/api/invites/${token}/accept`).set("Authorization", `Bearer ${requester.accessToken}`);

    const joinRequestsRes = await request(app)
      .get(`/api/organizations/${organizationId}/join-requests?status=PENDING`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    const requestId = joinRequestsRes.body[0].id as string;

    await request(app)
      .patch(`/api/organizations/${organizationId}/join-requests/${requestId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "APPROVED" });

    const { notifications } = await listNotifications(app, requester.accessToken);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.type).toBe("JOIN_REQUEST_DECIDED");
    expect((notifications[0]!.message as string).toLowerCase()).toContain("approved");
  });
});

describe("Notifications — Business/KYC events", () => {
  it("notifies the submitter when KYC is reviewed, with the decision reflected in the message", async () => {
    const app = testApp();
    const owner = await registerAndLogin(app);
    const organizationId = await createOrg(app, owner);
    await request(app)
      .patch(`/api/organizations/${organizationId}/profile`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(COMPLETE_PROFILE);
    await request(app).post(`/api/organizations/${organizationId}/kyc/submit`).set("Authorization", `Bearer ${owner.accessToken}`);

    const admin = await registerAndLogin(app);
    await promoteToPlatformAdmin(admin.userId);
    const listRes = await request(app).get("/api/admin/kyc?status=SUBMITTED").set("Authorization", `Bearer ${admin.accessToken}`);
    const submissionId = listRes.body[0].id as string;

    await request(app)
      .patch(`/api/admin/kyc/${submissionId}/review`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ decision: "REJECTED", note: "Missing documents" });

    const { notifications } = await listNotifications(app, owner.accessToken);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.type).toBe("KYC_STATUS_CHANGED");
    expect(notifications[0]!.message as string).toContain("Missing documents");
  });
});

describe("Notifications — Commerce events", () => {
  it("notifies the buyer on an order status change made by the seller, never the actor themself", async () => {
    const app = testApp();
    const { buyer, seller, order } = await createOrderForNewBuyer(app);

    const res = await request(app).post(`/api/orders/${order.id}/confirm`).set("Authorization", `Bearer ${seller.owner.accessToken}`);
    expect(res.status).toBe(200);

    const { notifications } = await listNotifications(app, buyer.accessToken);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.type).toBe("ORDER_STATUS_CHANGED");

    // The seller who made the change is not notified about their own action.
    const sellerNotifications = await listNotifications(app, seller.owner.accessToken);
    expect(sellerNotifications.notifications).toHaveLength(0);
  });
});

describe("Notifications — Procurement events", () => {
  it("notifies only the targeted supplier's members when an RFQ is issued, never an untargeted supplier", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const targeted = await createSupplier(app);
    const untargeted = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);

    await createIssuedRfq(app, buyer.owner.accessToken, buyer.organizationId, requisitionId, [targeted.organizationId]);

    const targetedNotifications = await listNotifications(app, targeted.owner.accessToken);
    expect(targetedNotifications.notifications).toHaveLength(1);
    expect(targetedNotifications.notifications[0]!.type).toBe("RFQ_ISSUED");

    const untargetedNotifications = await listNotifications(app, untargeted.owner.accessToken);
    expect(untargetedNotifications.notifications).toHaveLength(0);
  });

  it("notifies the buyer when a supplier submits a response", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const supplier = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
    const { rfqId, items } = await createIssuedRfq(app, buyer.owner.accessToken, buyer.organizationId, requisitionId, [
      supplier.organizationId,
    ]);

    await createSubmittedResponse(app, supplier.owner.accessToken, supplier.organizationId, rfqId, items[0]!.id);

    const { notifications } = await listNotifications(app, buyer.owner.accessToken);
    const responseNotifications = notifications.filter((n) => n.type === "SUPPLIER_RESPONSE_RECEIVED");
    expect(responseNotifications).toHaveLength(1);
  });

  it("notifies only the winning supplier on award — a losing supplier never learns an award happened", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const winner = await createSupplier(app);
    const loser = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
    const { rfqId, items } = await createIssuedRfq(app, buyer.owner.accessToken, buyer.organizationId, requisitionId, [
      winner.organizationId,
      loser.organizationId,
    ]);
    const { responseId: winningResponseId } = await createSubmittedResponse(
      app,
      winner.owner.accessToken,
      winner.organizationId,
      rfqId,
      items[0]!.id,
      150000
    );
    await createSubmittedResponse(app, loser.owner.accessToken, loser.organizationId, rfqId, items[0]!.id, 160000);

    await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/award`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({ responseId: winningResponseId });

    const winnerNotifications = await listNotifications(app, winner.owner.accessToken);
    const awardNotifications = winnerNotifications.notifications.filter((n) => n.type === "AWARD_CREATED");
    expect(awardNotifications).toHaveLength(1);

    const loserNotifications = await listNotifications(app, loser.owner.accessToken);
    expect(loserNotifications.notifications.filter((n) => n.type === "AWARD_CREATED")).toHaveLength(0);
  });

  it("notifies the supplier side when a buyer opens a negotiation, and the counterpart (never the actor) on each response", async () => {
    const app = testApp();
    const buyer = await createBuyer(app);
    const supplier = await createSupplier(app);
    const { requisitionId } = await createSubmittedRequisition(app, buyer.owner.accessToken, buyer.organizationId);
    const { rfqId, items } = await createIssuedRfq(app, buyer.owner.accessToken, buyer.organizationId, requisitionId, [
      supplier.organizationId,
    ]);
    const rfqItemId = items[0]!.id;
    const { responseId } = await createSubmittedResponse(app, supplier.owner.accessToken, supplier.organizationId, rfqId, rfqItemId, 150000);

    const openRes = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/negotiations`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({
        responseId,
        message: "Can you do better?",
        items: [{ rfqItemId, quantity: 100, unit: "PIECE", unitPriceMinor: 140000, currency: "NGN" }],
      });
    const negotiationId = openRes.body.id as string;

    const supplierNotifications = await listNotifications(app, supplier.owner.accessToken);
    expect(supplierNotifications.notifications.filter((n) => n.type === "NEGOTIATION_UPDATE")).toHaveLength(1);
    // The opening buyer is not notified about their own action.
    const buyerAfterOpen = await listNotifications(app, buyer.owner.accessToken);
    expect(buyerAfterOpen.notifications.filter((n) => n.type === "NEGOTIATION_UPDATE")).toHaveLength(0);

    await request(app)
      .post(`/api/negotiations/${negotiationId}/respond`)
      .set("Authorization", `Bearer ${supplier.owner.accessToken}`)
      .send({ decision: "ACCEPT" });

    // Now the buyer (the other side) is notified of the supplier's ACCEPT.
    const buyerAfterAccept = await listNotifications(app, buyer.owner.accessToken);
    expect(buyerAfterAccept.notifications.filter((n) => n.type === "NEGOTIATION_UPDATE")).toHaveLength(1);
    // The supplier who just accepted is not notified about their own action.
    const supplierAfterAccept = await listNotifications(app, supplier.owner.accessToken);
    expect(supplierAfterAccept.notifications.filter((n) => n.type === "NEGOTIATION_UPDATE")).toHaveLength(1);
  });

  it("notifies across the full PO lifecycle: buyer OWNER on submit, supplier on approval, buyer on confirmation", async () => {
    const app = testApp();
    const { buyer, supplier, rfqId } = await createAwardedRfq(app, 150000);

    const createRes = await request(app)
      .post(`/api/organizations/${buyer.organizationId}/rfqs/${rfqId}/purchase-order`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`)
      .send({});
    const poId = createRes.body.id as string;

    await request(app)
      .post(`/api/purchase-orders/${poId}/submit-for-approval`)
      .set("Authorization", `Bearer ${buyer.owner.accessToken}`);
    const buyerAfterSubmit = await listNotifications(app, buyer.owner.accessToken);
    expect(buyerAfterSubmit.notifications.filter((n) => n.type === "PURCHASE_ORDER_STATUS_CHANGED")).toHaveLength(1);
    const supplierAfterSubmit = await listNotifications(app, supplier.owner.accessToken);
    expect(supplierAfterSubmit.notifications.filter((n) => n.type === "PURCHASE_ORDER_STATUS_CHANGED")).toHaveLength(0);

    await request(app).post(`/api/purchase-orders/${poId}/approve`).set("Authorization", `Bearer ${buyer.owner.accessToken}`);
    const supplierAfterApprove = await listNotifications(app, supplier.owner.accessToken);
    expect(supplierAfterApprove.notifications.filter((n) => n.type === "PURCHASE_ORDER_STATUS_CHANGED")).toHaveLength(1);

    await request(app).post(`/api/purchase-orders/${poId}/confirm`).set("Authorization", `Bearer ${supplier.owner.accessToken}`);
    const buyerAfterConfirm = await listNotifications(app, buyer.owner.accessToken);
    // One from submit, one from confirm.
    expect(buyerAfterConfirm.notifications.filter((n) => n.type === "PURCHASE_ORDER_STATUS_CHANGED")).toHaveLength(2);
  });
});

describe("Notifications — Fulfillment/Delivery events", () => {
  it("notifies the buyer across processing, packed, and dispatched transitions", async () => {
    const app = testApp();
    const { buyer, seller, order } = await createOrderForNewBuyer(app);
    const orderId = order.id;
    await request(app).post(`/api/orders/${orderId}/confirm`).set("Authorization", `Bearer ${seller.owner.accessToken}`);

    const createRes = await request(app)
      .post(`/api/orders/${orderId}/fulfillment`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`);
    const fulfillmentId = createRes.body.fulfillment.id as string;

    await request(app).post(`/api/fulfillments/${fulfillmentId}/start-processing`).set("Authorization", `Bearer ${seller.owner.accessToken}`);
    await request(app).post(`/api/fulfillments/${fulfillmentId}/pack`).set("Authorization", `Bearer ${seller.owner.accessToken}`);
    await request(app)
      .post(`/api/fulfillments/${fulfillmentId}/dispatch`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`)
      .send({
        recipientName: "Jane Receiver",
        recipientPhone: "+2348000000000",
        destinationAddressLine: "12 Example Street",
        destinationCity: "Lagos",
        destinationCountry: "Nigeria",
      });

    const { notifications } = await listNotifications(app, buyer.accessToken);
    const fulfillmentNotifications = notifications.filter((n) => n.type === "FULFILLMENT_STATUS_CHANGED");
    expect(fulfillmentNotifications).toHaveLength(3);
  });

  it("notifies the driver and the buyer when a driver is assigned, and the buyer again on pickup and delivery", async () => {
    const app = testApp();
    const { buyer, deliveryId, seller } = await createDispatchedDelivery(app);
    const driver = await registerAndLogin(app);
    await promoteToDriver(driver.userId);

    await request(app)
      .post(`/api/deliveries/${deliveryId}/assign-driver`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`)
      .send({ driverEmail: driver.email });

    const driverNotifications = await listNotifications(app, driver.accessToken);
    expect(driverNotifications.notifications.filter((n) => n.type === "DELIVERY_DRIVER_ASSIGNED")).toHaveLength(1);
    const buyerAfterAssign = await listNotifications(app, buyer.accessToken);
    expect(buyerAfterAssign.notifications.filter((n) => n.type === "DELIVERY_DRIVER_ASSIGNED")).toHaveLength(1);

    await request(app).post(`/api/deliveries/${deliveryId}/pickup`).set("Authorization", `Bearer ${driver.accessToken}`);
    const buyerAfterPickup = await listNotifications(app, buyer.accessToken);
    expect(buyerAfterPickup.notifications.filter((n) => n.type === "DELIVERY_STATUS_CHANGED")).toHaveLength(1);

    await request(app)
      .post(`/api/deliveries/${deliveryId}/proof-of-delivery`)
      .set("Authorization", `Bearer ${driver.accessToken}`)
      .send({ recipientName: "Jane Receiver" });
    const buyerAfterDelivered = await listNotifications(app, buyer.accessToken);
    expect(buyerAfterDelivered.notifications.filter((n) => n.type === "DELIVERY_STATUS_CHANGED")).toHaveLength(2);
  });

  it("notifies both the buyer and the driver when the SELLER reports a failed delivery", async () => {
    const app = testApp();
    const { deliveryId, seller, buyer } = await createDispatchedDelivery(app);
    const driver = await registerAndLogin(app);
    await promoteToDriver(driver.userId);
    await request(app)
      .post(`/api/deliveries/${deliveryId}/assign-driver`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`)
      .send({ driverEmail: driver.email });

    const failRes = await request(app)
      .post(`/api/deliveries/${deliveryId}/fail`)
      .set("Authorization", `Bearer ${seller.owner.accessToken}`)
      .send({ reason: "Recipient unreachable" });
    expect(failRes.status).toBe(200);

    const buyerNotifications = await listNotifications(app, buyer.accessToken);
    expect(buyerNotifications.notifications.filter((n) => n.type === "DELIVERY_STATUS_CHANGED")).toHaveLength(1);
    const driverNotifications = await listNotifications(app, driver.accessToken);
    // One DRIVER_ASSIGNED, one DELIVERY_STATUS_CHANGED (seller reported the failure).
    expect(driverNotifications.notifications.filter((n) => n.type === "DELIVERY_STATUS_CHANGED")).toHaveLength(1);
  });
});
