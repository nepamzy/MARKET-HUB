import type { OrderStatus } from "@market-hub/shared";
import { recordAudit } from "../../lib/audit";
import { resolvePurchaseTerms, type ResolvedPurchaseTerms } from "../../lib/commercePricing";
import { AppError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { ROLE_RANK } from "../../middleware/organizationAuth";
import { releaseReservationForOrder, reserveStockForOrder } from "../inventory/inventory.service";
import type { MembershipRole } from "@market-hub/shared";

const ORDER_SELECT = {
  id: true,
  buyerUserId: true,
  // Phase 6 frontend pass: the seller side previously had no way to know
  // who placed an order — only the opaque buyerUserId. Selecting the
  // existing buyerUser relation (no schema/migration change, already a
  // real FK) is the minimal fix; a real seller workspace cannot omit who
  // the customer is. Harmless for the buyer to see their own name/email
  // echoed back.
  buyerUser: { select: { id: true, name: true, email: true } },
  sellerOrganizationId: true,
  sellerOrganization: { select: { id: true, legalName: true } },
  status: true,
  currency: true,
  subtotalMinor: true,
  totalMinor: true,
  totalQuantity: true,
  cancelledAt: true,
  cancelReason: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: {
      id: true,
      productId: true,
      productName: true,
      sellerOrganizationName: true,
      unit: true,
      tier: true,
      quantity: true,
      unitPriceMinor: true,
      currency: true,
      lineTotalMinor: true,
    },
  },
} as const;

/**
 * Centralized, explicit transition table (Phase 6 §11) — the only place
 * that decides whether PENDING -> CONFIRMED etc. is legal. No route or
 * service function assigns `status` directly outside `transitionOrder`.
 * No PAID/AWAITING_PAYMENT state exists (no payment integration this
 * phase); no DELIVERED/SHIPPED state exists (no fulfillment yet).
 */
const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

async function transitionOrder(
  orderId: string,
  to: OrderStatus,
  actorUserId: string,
  auditAction: string,
  extraData: Record<string, unknown> = {}
) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true, sellerOrganizationId: true } });
  if (!order) {
    throw AppError.notFound("Order not found");
  }

  if (!ORDER_STATUS_TRANSITIONS[order.status].includes(to)) {
    throw AppError.conflict(`Cannot move an order from ${order.status} to ${to}`);
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { status: to, ...extraData },
  });

  await recordAudit({
    actorUserId,
    organizationId: order.sellerOrganizationId,
    action: auditAction,
    targetType: "Order",
    targetId: orderId,
    metadata: { from: order.status, to },
  });

  // Re-read through getOrderForViewer (not a raw re-select) so every
  // order-returning endpoint — GET and every action — has the exact same
  // response shape, including viewerRole/viewerSellerRole. Returning a
  // bare ORDER_SELECT here instead was a real bug: the frontend replaces
  // its order state with whatever an action responds with, and without
  // viewerRole it silently lost track of which lifecycle buttons to show
  // after the very first action.
  return getOrderForViewer(orderId, actorUserId);
}

/** Loads the caller's role in an order's seller organization, or null. */
async function getSellerRole(sellerOrganizationId: string, userId: string): Promise<MembershipRole | null> {
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId: sellerOrganizationId, userId } },
    select: { role: true },
  });
  return membership?.role ?? null;
}

/**
 * Orders span two organizations' worth of access (buyer and seller), so
 * this can't be the existing single-:organizationId middleware — it's a
 * per-order check against whichever side the caller is actually on. A
 * caller who is neither gets the identical 404 a nonexistent order would
 * give (Phase 6 §13: cross-organization access must not reveal that a
 * private order exists).
 */
async function assertSellerAccess(orderId: string, userId: string, minRole: MembershipRole): Promise<string> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { sellerOrganizationId: true } });
  if (!order) {
    throw AppError.notFound("Order not found");
  }
  const role = await getSellerRole(order.sellerOrganizationId, userId);
  if (!role || ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw AppError.notFound("Order not found");
  }
  return order.sellerOrganizationId;
}

export async function getOrderForViewer(orderId: string, viewerUserId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: ORDER_SELECT });
  if (!order) {
    throw AppError.notFound("Order not found");
  }

  if (order.buyerUserId === viewerUserId) {
    return { ...order, viewerRole: "buyer" as const, viewerSellerRole: null };
  }

  const role = await getSellerRole(order.sellerOrganizationId, viewerUserId);
  if (!role || ROLE_RANK[role] < ROLE_RANK.STAFF) {
    // Identical to "doesn't exist" — never confirm a private order's
    // existence to someone who isn't party to it.
    throw AppError.notFound("Order not found");
  }

  // viewerRole/viewerSellerRole are UI convenience only (which lifecycle
  // actions to show) — every action endpoint re-derives and re-checks this
  // itself server-side regardless of what this response says (Rule 6).
  return { ...order, viewerRole: "seller" as const, viewerSellerRole: role };
}

export async function listBuyerOrders(buyerUserId: string, page: number, pageSize: number) {
  const where = { buyerUserId };
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: ORDER_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ]);
  return { orders, page, pageSize, total };
}

export async function listSellerOrders(sellerOrganizationId: string, page: number, pageSize: number) {
  const where = { sellerOrganizationId };
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: ORDER_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ]);
  return { orders, page, pageSize, total };
}

export async function confirmOrder(orderId: string, actorUserId: string) {
  await assertSellerAccess(orderId, actorUserId, "MANAGER");
  return transitionOrder(orderId, "CONFIRMED", actorUserId, "ORDER_CONFIRMED");
}

export async function startProcessingOrder(orderId: string, actorUserId: string) {
  await assertSellerAccess(orderId, actorUserId, "MANAGER");
  return transitionOrder(orderId, "PROCESSING", actorUserId, "ORDER_PROCESSING_STARTED");
}

export async function completeOrder(orderId: string, actorUserId: string) {
  await assertSellerAccess(orderId, actorUserId, "MANAGER");
  return transitionOrder(orderId, "COMPLETED", actorUserId, "ORDER_COMPLETED");
}

/**
 * Either the buyer (self) or a MANAGER+ of the seller organization may
 * cancel, while the order is still PENDING or CONFIRMED (Phase 6 §12) —
 * deliberately conservative: once PROCESSING starts, the seller has begun
 * fulfillment work, and there is no fulfillment-cancellation policy to
 * invent yet, so cancellation simply stops being a valid transition from
 * there (enforced by ORDER_STATUS_TRANSITIONS, not a separate check).
 */
export async function cancelOrder(orderId: string, actorUserId: string, reason: string | undefined) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { buyerUserId: true, sellerOrganizationId: true } });
  if (!order) {
    throw AppError.notFound("Order not found");
  }

  const isBuyer = order.buyerUserId === actorUserId;
  if (!isBuyer) {
    const role = await getSellerRole(order.sellerOrganizationId, actorUserId);
    if (!role || ROLE_RANK[role] < ROLE_RANK.MANAGER) {
      throw AppError.notFound("Order not found");
    }
  }

  const result = await transitionOrder(orderId, "CANCELLED", actorUserId, "ORDER_CANCELLED", {
    cancelledAt: new Date(),
    cancelReason: reason ?? null,
  });

  // Phase 11 — only after the cancellation itself has committed. Releases
  // whatever is still reserved for this order; a correct no-op for any
  // item whose reservation a successful payment already consumed (see
  // inventory.service.ts's module doc comment for the full state machine).
  await releaseReservationForOrder(orderId);

  return result;
}

// --- Checkout -------------------------------------------------------------

export type CheckoutResult =
  | { status: "ok"; orders: Awaited<ReturnType<typeof getOrderForViewer>>[] }
  | { status: "empty_cart" }
  | { status: "already_checked_out" };

/** Internal sentinel — thrown inside the checkout transaction to signal
 * the cart-claim race was lost, then caught outside to return the normal
 * `already_checked_out` result without rolling back for an unexpected
 * reason (every other throw inside the transaction is a real failure). */
class AlreadyCheckedOutError extends Error {}

/**
 * Checkout is the one place a Cart becomes one-or-more Orders. The cart
 * claim (conditional UPDATE, exactly the pattern lib/refreshTokens.ts
 * uses for rotation — Phase 6 §18) now happens INSIDE the same
 * transaction as order creation and stock reservation (Phase 11), not
 * before it: once Phase 11 made "insufficient stock" a normal checkout
 * failure rather than a near-impossible DB error, claiming the cart
 * outside the transaction would leave it stuck checked-out with no
 * orders whenever a reservation failed. Claiming and creating atomically
 * together means either the whole checkout succeeds — cart claimed,
 * every order created, every item's stock reserved — or none of it does.
 */
export async function checkout(buyerUserId: string): Promise<CheckoutResult> {
  const cart = await prisma.cart.findFirst({ where: { buyerUserId, checkedOutAt: null } });
  if (!cart) {
    return { status: "empty_cart" };
  }

  const items = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    select: { productId: true, quantity: true },
  });
  if (items.length === 0) {
    return { status: "empty_cart" };
  }

  // Re-resolve EVERY item against live state — the authoritative
  // revalidation (Phase 6 §9/§13), independent of whatever the cart view
  // showed a moment earlier. Any single invalid item fails the whole
  // checkout rather than silently dropping it.
  const resolved: ResolvedPurchaseTerms[] = [];
  for (const item of items) {
    resolved.push(await resolvePurchaseTerms(item.productId, item.quantity));
  }

  // Group by (seller, currency) — one Order per group (Phase 6 §14/§15):
  // the existing "multi-seller checkout = independent seller orders"
  // decision, extended to never mix currencies within one order either
  // (Phase 6 §16).
  const groups = new Map<string, ResolvedPurchaseTerms[]>();
  for (const term of resolved) {
    const key = `${term.sellerOrganizationId}:${term.currency}`;
    const group = groups.get(key);
    if (group) group.push(term);
    else groups.set(key, [term]);
  }

  let orderIds: string[];
  try {
    orderIds = await prisma.$transaction(async (tx) => {
      const claim = await tx.cart.updateMany({
        where: { id: cart.id, checkedOutAt: null },
        data: { checkedOutAt: new Date() },
      });
      if (claim.count === 0) {
        // Lost the race — another request already checked this exact cart out.
        throw new AlreadyCheckedOutError();
      }

      const ids: string[] = [];
      for (const group of groups.values()) {
        const subtotalMinor = group.reduce((sum, t) => sum + t.lineTotalMinor, 0);
        const totalQuantity = group.reduce((sum, t) => sum + t.quantity, 0);
        const order = await tx.order.create({
          data: {
            buyerUserId,
            sellerOrganizationId: group[0]!.sellerOrganizationId,
            currency: group[0]!.currency,
            subtotalMinor,
            totalMinor: subtotalMinor,
            totalQuantity,
            items: {
              create: group.map((t) => ({
                productId: t.productId,
                productPriceId: t.productPriceId,
                productName: t.productName,
                sellerOrganizationName: t.sellerOrganizationName,
                unit: t.unit,
                tier: t.tier,
                quantity: t.quantity,
                unitPriceMinor: t.unitPriceMinor,
                currency: t.currency,
                lineTotalMinor: t.lineTotalMinor,
              })),
            },
          },
          select: { id: true },
        });

        // Phase 11 — reserved within the same transaction as order
        // creation: an oversold item rolls back the cart claim and every
        // order created so far in this checkout, not just this one item.
        await reserveStockForOrder(
          tx,
          order.id,
          group.map((t) => ({ productId: t.productId, productName: t.productName, quantity: t.quantity }))
        );

        ids.push(order.id);
      }
      return ids;
    });
  } catch (err) {
    if (err instanceof AlreadyCheckedOutError) {
      return { status: "already_checked_out" };
    }
    throw err;
  }

  for (const orderId of orderIds) {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { sellerOrganizationId: true } });
    await recordAudit({
      actorUserId: buyerUserId,
      organizationId: order.sellerOrganizationId,
      action: "ORDER_CREATED",
      targetType: "Order",
      targetId: orderId,
    });
  }

  const orders = await Promise.all(orderIds.map((id) => getOrderForViewer(id, buyerUserId)));
  return { status: "ok", orders };
}
