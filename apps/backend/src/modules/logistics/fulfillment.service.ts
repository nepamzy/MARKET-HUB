import type { FulfillmentStatus } from "@market-hub/shared";
import { recordAudit } from "../../lib/audit";
import { AppError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { ROLE_RANK } from "../../middleware/organizationAuth";
import { consumeReservationForOrder } from "../inventory/inventory.service";
import type { MembershipRole } from "@market-hub/shared";

const FULFILLMENT_SELECT = {
  id: true,
  orderId: true,
  sellerOrganizationId: true,
  sellerOrganization: { select: { id: true, legalName: true } },
  status: true,
  packedAt: true,
  dispatchedAt: true,
  exceptionReason: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: { id: true, orderItemId: true, productName: true, quantity: true },
  },
  delivery: { select: { id: true, status: true } },
} as const;

/**
 * Centralized, explicit transition table (same discipline as
 * orders.service.ts's ORDER_STATUS_TRANSITIONS) — the only place that
 * decides whether READY -> PROCESSING etc. is legal. Deliberately stops
 * at DISPATCHED; see schema.prisma's Fulfillment doc comment for why
 * pickup/transit/delivery is Delivery's own state machine, not this one's.
 */
const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  READY: ["PROCESSING", "EXCEPTION"],
  PROCESSING: ["PACKED", "EXCEPTION"],
  PACKED: ["DISPATCHED", "EXCEPTION"],
  DISPATCHED: [],
  EXCEPTION: [],
};

async function getSellerRole(sellerOrganizationId: string, userId: string): Promise<MembershipRole | null> {
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId: sellerOrganizationId, userId } },
    select: { role: true },
  });
  return membership?.role ?? null;
}

/** Same anti-enumeration discipline as orders.service.ts's
 * assertSellerAccess — a caller who isn't at least `minRole` in the
 * fulfillment's seller organization gets the identical 404 a nonexistent
 * fulfillment would give. */
async function assertSellerAccess(fulfillmentId: string, userId: string, minRole: MembershipRole): Promise<{ sellerOrganizationId: string; orderId: string }> {
  const fulfillment = await prisma.fulfillment.findUnique({
    where: { id: fulfillmentId },
    select: { sellerOrganizationId: true, orderId: true },
  });
  if (!fulfillment) {
    throw AppError.notFound("Fulfillment not found");
  }
  const role = await getSellerRole(fulfillment.sellerOrganizationId, userId);
  if (!role || ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw AppError.notFound("Fulfillment not found");
  }
  return fulfillment;
}

/**
 * The server-side payment eligibility rule (Phase 12): an order with no
 * Payment rows at all never required online payment (cash/other
 * arrangement — Rule: do not assume every order must be prepaid), so it
 * is eligible. An order with at least one Payment attempt is eligible
 * only once one of them actually SUCCEEDED — never because the frontend
 * merely redirected back, and never because a payment is still
 * PENDING/PROCESSING.
 */
async function assertPaymentEligible(orderId: string): Promise<void> {
  const payments = await prisma.payment.findMany({ where: { orderId }, select: { status: true } });
  if (payments.length === 0) return;
  if (!payments.some((p) => p.status === "SUCCESS")) {
    throw AppError.conflict("This order cannot be fulfilled until a payment succeeds");
  }
}

/**
 * Creates the one Fulfillment for an order (orderId is @unique at the
 * database level — "no duplicate fulfillment records" holds even under a
 * race, not just via this service-layer check). Eligible once the order
 * is CONFIRMED or PROCESSING — not PENDING (seller hasn't acknowledged
 * it yet), not CANCELLED, not COMPLETED (already finished) — and payment-
 * eligible per assertPaymentEligible. FulfillmentItem quantities are
 * always exactly the order's own item quantities (no partial fulfillment
 * in this foundation), and the reservation this order's checkout made is
 * finalized here via the EXISTING Phase 11 consumeReservationForOrder —
 * reused verbatim, not reimplemented, and safe to call even if a
 * successful Payment already consumed it (that function's own
 * idempotency guard no-ops in that case; see inventory.service.ts).
 */
export async function createFulfillment(orderId: string, actorUserId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, sellerOrganizationId: true, status: true },
  });
  if (!order) {
    throw AppError.notFound("Order not found");
  }

  const role = await getSellerRole(order.sellerOrganizationId, actorUserId);
  if (!role || ROLE_RANK[role] < ROLE_RANK.MANAGER) {
    throw AppError.notFound("Order not found");
  }

  if (order.status !== "CONFIRMED" && order.status !== "PROCESSING") {
    throw AppError.conflict(`An order must be confirmed before it can be fulfilled (current status: ${order.status})`);
  }

  const existing = await prisma.fulfillment.findUnique({ where: { orderId }, select: { id: true } });
  if (existing) {
    throw AppError.conflict("This order already has a fulfillment record");
  }

  await assertPaymentEligible(orderId);

  const items = await prisma.orderItem.findMany({
    where: { orderId },
    select: { id: true, productName: true, quantity: true },
  });

  const fulfillment = await prisma.$transaction(async (tx) => {
    const created = await tx.fulfillment.create({
      data: {
        orderId,
        sellerOrganizationId: order.sellerOrganizationId,
        createdByUserId: actorUserId,
        items: {
          create: items.map((item) => ({
            orderItemId: item.id,
            productName: item.productName,
            quantity: item.quantity,
          })),
        },
      },
      select: { id: true },
    });

    // Finalizes this order's stock reservation into a completed sale —
    // the point-of-no-return for inventory, whether or not a Payment ever
    // triggered it already (see this function's doc comment).
    await consumeReservationForOrder(tx, orderId);

    return created;
  });

  await recordAudit({
    actorUserId,
    organizationId: order.sellerOrganizationId,
    action: "FULFILLMENT_CREATED",
    targetType: "Fulfillment",
    targetId: fulfillment.id,
    metadata: { orderId },
  });

  return getFulfillmentForViewer(fulfillment.id, actorUserId);
}

async function transitionFulfillment(
  fulfillmentId: string,
  to: FulfillmentStatus,
  actorUserId: string,
  auditAction: string,
  extraData: Record<string, unknown> = {}
) {
  const fulfillment = await prisma.fulfillment.findUnique({ where: { id: fulfillmentId }, select: { status: true, sellerOrganizationId: true } });
  if (!fulfillment) {
    throw AppError.notFound("Fulfillment not found");
  }
  if (!FULFILLMENT_TRANSITIONS[fulfillment.status].includes(to)) {
    throw AppError.conflict(`Cannot move a fulfillment from ${fulfillment.status} to ${to}`);
  }

  await prisma.fulfillment.update({ where: { id: fulfillmentId }, data: { status: to, ...extraData } });

  await recordAudit({
    actorUserId,
    organizationId: fulfillment.sellerOrganizationId,
    action: auditAction,
    targetType: "Fulfillment",
    targetId: fulfillmentId,
    metadata: { from: fulfillment.status, to },
  });

  return getFulfillmentForViewer(fulfillmentId, actorUserId);
}

export async function startProcessingFulfillment(fulfillmentId: string, actorUserId: string) {
  await assertSellerAccess(fulfillmentId, actorUserId, "STAFF");
  return transitionFulfillment(fulfillmentId, "PROCESSING", actorUserId, "FULFILLMENT_PROCESSING_STARTED");
}

export async function markFulfillmentPacked(fulfillmentId: string, actorUserId: string) {
  await assertSellerAccess(fulfillmentId, actorUserId, "STAFF");
  return transitionFulfillment(fulfillmentId, "PACKED", actorUserId, "FULFILLMENT_PACKED", { packedAt: new Date() });
}

export async function markFulfillmentException(fulfillmentId: string, actorUserId: string, reason: string) {
  await assertSellerAccess(fulfillmentId, actorUserId, "STAFF");
  return transitionFulfillment(fulfillmentId, "EXCEPTION", actorUserId, "FULFILLMENT_EXCEPTION", { exceptionReason: reason });
}

export interface DispatchInput {
  recipientName: string;
  recipientPhone: string;
  destinationAddressLine: string;
  destinationCity: string;
  destinationState?: string;
  destinationCountry: string;
}

/**
 * The one place a Delivery is ever created — always exactly one per
 * Fulfillment (fulfillmentId is @unique) the instant Fulfillment reaches
 * DISPATCHED, in the same transaction as that status change.
 */
export async function dispatchFulfillment(fulfillmentId: string, actorUserId: string, input: DispatchInput) {
  const { sellerOrganizationId } = await assertSellerAccess(fulfillmentId, actorUserId, "MANAGER");

  const fulfillment = await prisma.fulfillment.findUniqueOrThrow({
    where: { id: fulfillmentId },
    select: { status: true, orderId: true },
  });
  if (!FULFILLMENT_TRANSITIONS[fulfillment.status].includes("DISPATCHED")) {
    throw AppError.conflict(`Cannot dispatch a fulfillment from ${fulfillment.status}`);
  }

  const order = await prisma.order.findUniqueOrThrow({ where: { id: fulfillment.orderId }, select: { buyerUserId: true } });

  await prisma.$transaction(async (tx) => {
    await tx.fulfillment.update({ where: { id: fulfillmentId }, data: { status: "DISPATCHED", dispatchedAt: new Date() } });
    const delivery = await tx.delivery.create({
      data: {
        fulfillmentId,
        orderId: fulfillment.orderId,
        sellerOrganizationId,
        buyerUserId: order.buyerUserId,
        recipientName: input.recipientName,
        recipientPhone: input.recipientPhone,
        destinationAddressLine: input.destinationAddressLine,
        destinationCity: input.destinationCity,
        destinationState: input.destinationState,
        destinationCountry: input.destinationCountry,
      },
      select: { id: true },
    });
    await tx.deliveryEvent.create({ data: { deliveryId: delivery.id, type: "CREATED", actorUserId } });
  });

  await recordAudit({
    actorUserId,
    organizationId: sellerOrganizationId,
    action: "FULFILLMENT_DISPATCHED",
    targetType: "Fulfillment",
    targetId: fulfillmentId,
    metadata: { orderId: fulfillment.orderId },
  });

  return getFulfillmentForViewer(fulfillmentId, actorUserId);
}

/** Buyer (order's own buyer) or seller org STAFF+ may view — same
 * anti-enumeration discipline as orders.service.ts's getOrderForViewer. */
export async function getFulfillmentForViewer(fulfillmentId: string, viewerUserId: string) {
  const fulfillment = await prisma.fulfillment.findUnique({ where: { id: fulfillmentId }, select: FULFILLMENT_SELECT });
  if (!fulfillment) {
    throw AppError.notFound("Fulfillment not found");
  }

  const order = await prisma.order.findUniqueOrThrow({ where: { id: fulfillment.orderId }, select: { buyerUserId: true } });
  if (order.buyerUserId === viewerUserId) {
    return { ...fulfillment, viewerRole: "buyer" as const };
  }

  const role = await getSellerRole(fulfillment.sellerOrganizationId, viewerUserId);
  if (!role || ROLE_RANK[role] < ROLE_RANK.STAFF) {
    throw AppError.notFound("Fulfillment not found");
  }
  return { ...fulfillment, viewerRole: "seller" as const };
}

/** Buyer-facing lookup from the order detail page — returns null (not a
 * 404) when no fulfillment exists yet, since that's the normal state for
 * most orders, not an error. */
export async function getFulfillmentForOrder(orderId: string, viewerUserId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { buyerUserId: true, sellerOrganizationId: true } });
  if (!order) {
    throw AppError.notFound("Order not found");
  }
  const isBuyer = order.buyerUserId === viewerUserId;
  if (!isBuyer) {
    const role = await getSellerRole(order.sellerOrganizationId, viewerUserId);
    if (!role) {
      throw AppError.notFound("Order not found");
    }
  }
  const fulfillment = await prisma.fulfillment.findUnique({ where: { orderId }, select: { id: true } });
  if (!fulfillment) return null;
  return getFulfillmentForViewer(fulfillment.id, viewerUserId);
}

export async function listFulfillmentsForOrganization(
  organizationId: string,
  status: FulfillmentStatus | undefined,
  page: number,
  pageSize: number
) {
  const where = { sellerOrganizationId: organizationId, ...(status ? { status } : {}) };
  const [fulfillments, total] = await Promise.all([
    prisma.fulfillment.findMany({
      where,
      select: FULFILLMENT_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.fulfillment.count({ where }),
  ]);
  return { fulfillments, page, pageSize, total };
}
