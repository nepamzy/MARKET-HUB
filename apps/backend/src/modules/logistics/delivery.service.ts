import { recordAudit } from "../../lib/audit";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { ROLE_RANK } from "../../middleware/organizationAuth";
import type { MembershipRole } from "@market-hub/shared";

/** A location older than this is shown as stale rather than "current" —
 * never silently presented as live when it may no longer be. */
const LOCATION_STALE_AFTER_MS = 10 * 60 * 1000;

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "P2002";
}

const DELIVERY_SELECT = {
  id: true,
  fulfillmentId: true,
  orderId: true,
  sellerOrganizationId: true,
  sellerOrganization: { select: { id: true, legalName: true } },
  buyerUserId: true,
  buyerUser: { select: { id: true, name: true } },
  status: true,
  recipientName: true,
  recipientPhone: true,
  destinationAddressLine: true,
  destinationCity: true,
  destinationState: true,
  destinationCountry: true,
  driverUserId: true,
  driverUser: { select: { id: true, name: true, email: true } },
  assignedAt: true,
  pickedUpAt: true,
  deliveredAt: true,
  failedAt: true,
  failureReason: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function getSellerRole(sellerOrganizationId: string, userId: string): Promise<MembershipRole | null> {
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId: sellerOrganizationId, userId } },
    select: { role: true },
  });
  return membership?.role ?? null;
}

type ViewerRole = "seller" | "buyer" | "driver";

/**
 * A delivery spans THREE parties (seller org, buyer, assigned driver) —
 * same "spans two organizations/parties" pattern as Order/RFQ/
 * Negotiation/PurchaseOrder, extended to a third. A caller who is none of
 * them gets the identical 404 a nonexistent delivery would give (Rule:
 * never expose unnecessary personal information, never make delivery
 * records publicly discoverable).
 */
async function resolveViewer(deliveryId: string, viewerUserId: string): Promise<{ role: ViewerRole; sellerOrganizationId: string; buyerUserId: string; driverUserId: string | null }> {
  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    select: { sellerOrganizationId: true, buyerUserId: true, driverUserId: true },
  });
  if (!delivery) {
    throw AppError.notFound("Delivery not found");
  }
  if (delivery.buyerUserId === viewerUserId) {
    return { role: "buyer", ...delivery };
  }
  if (delivery.driverUserId === viewerUserId) {
    return { role: "driver", ...delivery };
  }
  const sellerRole = await getSellerRole(delivery.sellerOrganizationId, viewerUserId);
  if (sellerRole && ROLE_RANK[sellerRole] >= ROLE_RANK.STAFF) {
    return { role: "seller", ...delivery };
  }
  throw AppError.notFound("Delivery not found");
}

export async function getDeliveryForViewer(deliveryId: string, viewerUserId: string) {
  const viewer = await resolveViewer(deliveryId, viewerUserId);
  const delivery = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId }, select: DELIVERY_SELECT });
  return { ...delivery, viewerRole: viewer.role };
}

/**
 * Seller MANAGER+ assigns a specific, already-existing User whose
 * platformRole is DRIVER, identified by email — never a searchable
 * roster (Rule 10). Reassignment (replacing an already-assigned driver)
 * is allowed only while PENDING_PICKUP — once a driver has picked up,
 * the delivery is theirs until DELIVERED/FAILED.
 */
export async function assignDriver(deliveryId: string, actorUserId: string, driverEmail: string) {
  const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId }, select: { sellerOrganizationId: true, status: true } });
  if (!delivery) {
    throw AppError.notFound("Delivery not found");
  }
  const role = await getSellerRole(delivery.sellerOrganizationId, actorUserId);
  if (!role || ROLE_RANK[role] < ROLE_RANK.MANAGER) {
    throw AppError.notFound("Delivery not found");
  }
  if (delivery.status !== "PENDING_PICKUP") {
    throw AppError.conflict(`Cannot assign a driver once a delivery is ${delivery.status}`);
  }

  const driver = await prisma.user.findUnique({ where: { email: driverEmail.toLowerCase() }, select: { id: true, platformRole: true } });
  if (!driver || driver.platformRole !== "DRIVER") {
    throw AppError.badRequest("No driver account exists with that email");
  }

  await prisma.$transaction(async (tx) => {
    await tx.delivery.update({ where: { id: deliveryId }, data: { driverUserId: driver.id, assignedAt: new Date() } });
    await tx.deliveryEvent.create({ data: { deliveryId, type: "DRIVER_ASSIGNED", actorUserId } });
  });

  await recordAudit({
    actorUserId,
    organizationId: delivery.sellerOrganizationId,
    action: "DELIVERY_DRIVER_ASSIGNED",
    targetType: "Delivery",
    targetId: deliveryId,
    metadata: { driverUserId: driver.id },
  });

  return getDeliveryForViewer(deliveryId, actorUserId);
}

async function assertAssignedDriver(deliveryId: string, driverUserId: string) {
  const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId }, select: { driverUserId: true, status: true, sellerOrganizationId: true } });
  if (!delivery || delivery.driverUserId !== driverUserId) {
    // Identical to "doesn't exist" — a driver must never learn that a
    // delivery assigned to someone else exists (Rule: a driver must not
    // automatically gain access to all orders).
    throw AppError.notFound("Delivery not found");
  }
  return delivery;
}

export async function markPickedUp(deliveryId: string, driverUserId: string) {
  const delivery = await assertAssignedDriver(deliveryId, driverUserId);
  if (delivery.status !== "PENDING_PICKUP") {
    throw AppError.conflict(`Cannot mark picked up from ${delivery.status}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.delivery.update({ where: { id: deliveryId }, data: { status: "IN_TRANSIT", pickedUpAt: new Date() } });
    await tx.deliveryEvent.create({ data: { deliveryId, type: "PICKED_UP", actorUserId: driverUserId } });
  });

  await recordAudit({
    actorUserId: driverUserId,
    organizationId: delivery.sellerOrganizationId,
    action: "DELIVERY_PICKED_UP",
    targetType: "Delivery",
    targetId: deliveryId,
  });

  return getDeliveryForViewer(deliveryId, driverUserId);
}

/**
 * A real GPS ping — never faked, never randomly generated (Rule). Only
 * the assigned driver may write one, and only while the delivery is
 * actually IN_TRANSIT (a ping before pickup or after completion carries
 * no meaning). Append-only: "last known location" is always just the
 * most recent row, nothing is ever overwritten.
 */
export async function recordLocation(deliveryId: string, driverUserId: string, latitude: number, longitude: number) {
  const delivery = await assertAssignedDriver(deliveryId, driverUserId);
  if (delivery.status !== "IN_TRANSIT") {
    throw AppError.conflict(`Cannot record a location while the delivery is ${delivery.status}`);
  }

  await prisma.driverLocationUpdate.create({ data: { deliveryId, driverUserId, latitude, longitude } });
  return { recorded: true };
}

export interface LocationView {
  latitude: number;
  longitude: number;
  recordedAt: Date;
  stale: boolean;
}

/**
 * Party-only (resolveViewer enforces this) — never exposed through a
 * public API. Returns null, not a fabricated point, when the driver has
 * never sent one yet; the frontend shows "Waiting for driver's first
 * location update" for that case, never a stale pin presented as current.
 */
export async function getLatestLocation(deliveryId: string, viewerUserId: string): Promise<LocationView | null> {
  await resolveViewer(deliveryId, viewerUserId);
  const location = await prisma.driverLocationUpdate.findFirst({
    where: { deliveryId },
    orderBy: { recordedAt: "desc" },
    select: { latitude: true, longitude: true, recordedAt: true },
  });
  if (!location) return null;
  return { ...location, stale: Date.now() - location.recordedAt.getTime() > LOCATION_STALE_AFTER_MS };
}

export async function getDeliveryEvents(deliveryId: string, viewerUserId: string) {
  await resolveViewer(deliveryId, viewerUserId);
  return prisma.deliveryEvent.findMany({
    where: { deliveryId },
    select: { id: true, type: true, note: true, actorUserId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Driver-confirmed completion. Never trusts a bare client "success" flag:
 * requires the caller to actually be the assigned driver and the delivery
 * to actually be IN_TRANSIT, both re-checked server-side regardless of
 * what the request claims. Text-only evidence — see schema.prisma's
 * ProofOfDelivery doc comment for why no file/photo upload exists here.
 */
export async function confirmProofOfDelivery(
  deliveryId: string,
  driverUserId: string,
  input: { recipientName?: string; notes?: string }
) {
  const delivery = await assertAssignedDriver(deliveryId, driverUserId);

  // A retried submit (e.g. a flaky network on the driver's app) lands here
  // with the delivery already DELIVERED from the first, successful call —
  // genuinely idempotent: return the current state rather than erroring,
  // and never create a second ProofOfDelivery row either way. Any other
  // non-IN_TRANSIT status (PENDING_PICKUP, FAILED) is a real conflict.
  if (delivery.status === "DELIVERED") {
    return getDeliveryForViewer(deliveryId, driverUserId);
  }
  if (delivery.status !== "IN_TRANSIT") {
    throw AppError.conflict(`Cannot confirm delivery from ${delivery.status}`);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.proofOfDelivery.create({
        data: { deliveryId, confirmedByUserId: driverUserId, recipientName: input.recipientName, notes: input.notes },
      });
      await tx.delivery.update({ where: { id: deliveryId }, data: { status: "DELIVERED", deliveredAt: new Date() } });
      await tx.deliveryEvent.create({ data: { deliveryId, type: "DELIVERED", actorUserId: driverUserId, note: input.notes } });
    });
  } catch (err) {
    // A genuinely simultaneous second confirm can lose the outer status
    // check's race and reach here — ProofOfDelivery.deliveryId's unique
    // constraint is the actual guarantee against two completion records,
    // caught and treated the same as the already-DELIVERED case above.
    if (isUniqueConstraintError(err)) {
      return getDeliveryForViewer(deliveryId, driverUserId);
    }
    throw err;
  }

  await recordAudit({
    actorUserId: driverUserId,
    organizationId: delivery.sellerOrganizationId,
    action: "DELIVERY_DELIVERED",
    targetType: "Delivery",
    targetId: deliveryId,
  });

  return getDeliveryForViewer(deliveryId, driverUserId);
}

/** The assigned driver, or seller MANAGER+ (the driver may be
 * unreachable), may report a failed delivery. */
export async function markDeliveryFailed(deliveryId: string, actorUserId: string, reason: string) {
  const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId }, select: { driverUserId: true, status: true, sellerOrganizationId: true } });
  if (!delivery) {
    throw AppError.notFound("Delivery not found");
  }
  const isDriver = delivery.driverUserId === actorUserId;
  if (!isDriver) {
    const role = await getSellerRole(delivery.sellerOrganizationId, actorUserId);
    if (!role || ROLE_RANK[role] < ROLE_RANK.MANAGER) {
      throw AppError.notFound("Delivery not found");
    }
  }
  if (delivery.status !== "PENDING_PICKUP" && delivery.status !== "IN_TRANSIT") {
    throw AppError.conflict(`Cannot fail a delivery from ${delivery.status}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.delivery.update({ where: { id: deliveryId }, data: { status: "FAILED", failedAt: new Date(), failureReason: reason } });
    await tx.deliveryEvent.create({ data: { deliveryId, type: "FAILED", actorUserId, note: reason } });
  });

  await recordAudit({
    actorUserId,
    organizationId: delivery.sellerOrganizationId,
    action: "DELIVERY_FAILED",
    targetType: "Delivery",
    targetId: deliveryId,
    metadata: { reason },
  });

  logger.warn({ deliveryId, reason }, "Delivery marked failed");

  return getDeliveryForViewer(deliveryId, actorUserId);
}

/** The driver's own assigned-deliveries view — never any other driver's,
 * never any delivery they aren't assigned to. */
export async function listDeliveriesForDriver(driverUserId: string) {
  return prisma.delivery.findMany({
    where: { driverUserId },
    select: DELIVERY_SELECT,
    orderBy: { createdAt: "desc" },
  });
}
