import type { Prisma } from "@prisma/client";
import { recordAudit } from "../../lib/audit";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";

/**
 * Phase 11 — Inventory foundation.
 *
 * The reserve -> consume|release state machine this module owns, in full:
 *
 *   checkout (reserveStockForOrder, inside the same transaction that
 *   creates the Order) increments `reserved` for every order item whose
 *   product has an Inventory row, guarded so it can never push `reserved`
 *   above `onHand` — the one thing that actually prevents overselling.
 *   A product with NO Inventory row is untracked and is skipped entirely
 *   (Rule 13: every product created before this phase sells with no
 *   quantity limit today; making tracking mandatory would silently break
 *   checkout for every existing seller).
 *
 *   A successful Payment (consumeReservationForOrder, called from
 *   payments.service.ts's applyVerificationResult, inside the same
 *   transaction that marks the Payment SUCCESS) converts that order's
 *   reservation into a finalized sale: `onHand` and `reserved` both drop
 *   by the same amount, in one guarded update, in one StockMovement. This
 *   is the "when does stock actually leave" rule this phase uses — chosen
 *   over consuming at checkout itself because Phase 10 payments now exist
 *   and deducting real stock for an order nobody has paid for yet is a
 *   worse default than deducting it once money has actually moved.
 *
 *   An order cancellation (releaseReservationForOrder, called from
 *   orders.service.ts's cancelOrder after the cancellation itself commits)
 *   releases whatever is still reserved for that order. A payment that
 *   merely FAILS does NOT release anything — the buyer may retry payment
 *   on the same order, and the reservation is what keeps that possible
 *   without a second buyer winning the stock out from under them; only an
 *   actual order cancellation releases it. An order that is simply
 *   abandoned (never paid, never cancelled) keeps its reservation
 *   indefinitely — there is no abandoned-reservation sweep in this phase;
 *   that is a new feature this foundation deliberately does not invent.
 *
 * Both consume and release are idempotent against the SAME order firing
 * twice (payment verified twice, or a release somehow attempted twice):
 * each checks for a prior SALE/RELEASE StockMovement for that
 * (inventory, order) pair before acting, and the guarded UPDATE itself
 * additionally refuses to push `reserved` negative even if that check
 * were ever bypassed. Consuming after the order was already cancelled
 * (a late webhook arriving after cancellation) is explicitly a no-op,
 * never a negative-reserved bug and never a silent double-sale — see
 * consumeReservationForOrder.
 */

type Tx = Prisma.TransactionClient;

export interface ReserveStockItem {
  productId: string;
  productName: string;
  quantity: number;
}

/**
 * Called from orders.service.ts's checkout(), inside the same transaction
 * that creates the Order — if any item is oversold, the whole checkout
 * (order creation, cart claim, every other item's reservation) rolls back
 * together, the same "any single invalid item fails the whole checkout"
 * guarantee checkout already gives for price/availability.
 */
export async function reserveStockForOrder(tx: Tx, orderId: string, items: ReserveStockItem[]): Promise<void> {
  for (const item of items) {
    const inventory = await tx.inventory.findUnique({ where: { productId: item.productId }, select: { id: true } });
    if (!inventory) continue; // untracked product — unlimited availability, unchanged from pre-Phase-11 behavior

    const affected = await tx.$executeRaw`
      UPDATE inventory
      SET reserved = reserved + ${item.quantity}, "updatedAt" = now()
      WHERE id = ${inventory.id} AND "onHand" - reserved >= ${item.quantity}
    `;
    if (affected === 0) {
      throw AppError.conflict(`Insufficient stock available for ${item.productName}`);
    }

    await tx.stockMovement.create({
      data: { inventoryId: inventory.id, type: "RESERVATION", quantity: item.quantity, orderId },
    });
  }
}

/**
 * Called from payments.service.ts's applyVerificationResult, inside the
 * same transaction that marks a Payment SUCCESS. Converts this order's
 * outstanding reservation into a finalized sale (onHand and reserved both
 * drop together, in one movement — see the module doc comment for why
 * SALE is a single type rather than "release + separate deduction").
 */
export async function consumeReservationForOrder(tx: Tx, orderId: string): Promise<void> {
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!order || order.status === "CANCELLED") {
    // Already released by cancellation (or the order vanished, which
    // shouldn't happen given Order's onDelete:Restrict relations) —
    // nothing to consume. A payment succeeding for a cancelled order is
    // a money/refund question this phase does not answer; the inventory
    // side simply does nothing further, correctly.
    return;
  }

  const items = await tx.orderItem.findMany({ where: { orderId }, select: { productId: true, quantity: true } });
  for (const item of items) {
    const inventory = await tx.inventory.findUnique({ where: { productId: item.productId }, select: { id: true } });
    if (!inventory) continue;

    const alreadyFinalized = await tx.stockMovement.findFirst({
      where: { inventoryId: inventory.id, orderId, type: { in: ["SALE", "RELEASE"] } },
      select: { id: true },
    });
    if (alreadyFinalized) continue; // idempotent — already consumed or released

    const affected = await tx.$executeRaw`
      UPDATE inventory
      SET "onHand" = "onHand" - ${item.quantity}, reserved = reserved - ${item.quantity}, "updatedAt" = now()
      WHERE id = ${inventory.id} AND reserved >= ${item.quantity}
    `;
    if (affected === 0) {
      // Should not happen given the reservation invariant (reserved never
      // exceeds onHand), but never let an inventory inconsistency block a
      // successful payment from being recorded — log and move on.
      logger.error({ inventoryId: inventory.id, orderId }, "Could not consume stock reservation: reserved count too low");
      continue;
    }

    await tx.stockMovement.create({
      data: { inventoryId: inventory.id, type: "SALE", quantity: -item.quantity, orderId },
    });
  }
}

/**
 * Called from orders.service.ts's cancelOrder, after the order's status
 * transition to CANCELLED has already committed. Not already inside a
 * transaction (cancelOrder isn't one), so this opens its own.
 */
export async function releaseReservationForOrder(orderId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const items = await tx.orderItem.findMany({ where: { orderId }, select: { productId: true, quantity: true } });
    for (const item of items) {
      const inventory = await tx.inventory.findUnique({ where: { productId: item.productId }, select: { id: true } });
      if (!inventory) continue;

      const alreadyFinalized = await tx.stockMovement.findFirst({
        where: { inventoryId: inventory.id, orderId, type: { in: ["SALE", "RELEASE"] } },
        select: { id: true },
      });
      if (alreadyFinalized) continue; // idempotent, and correctly skips an order whose reservation was already consumed by a successful payment

      const affected = await tx.$executeRaw`
        UPDATE inventory
        SET reserved = reserved - ${item.quantity}, "updatedAt" = now()
        WHERE id = ${inventory.id} AND reserved >= ${item.quantity}
      `;
      if (affected === 0) {
        logger.error({ inventoryId: inventory.id, orderId }, "Could not release stock reservation: reserved count too low");
        continue;
      }

      await tx.stockMovement.create({
        data: { inventoryId: inventory.id, type: "RELEASE", quantity: -item.quantity, orderId },
      });
    }
  });
}

/** Read-only, advisory availability check — used by commercePricing.ts's
 * resolvePurchaseTerms so cart-add/checkout give an early, specific error
 * before the transactional guard in reserveStockForOrder is ever reached.
 * A product with no Inventory row is untracked and always available. */
export async function assertStockAvailable(productId: string, productName: string, quantity: number): Promise<void> {
  const inventory = await prisma.inventory.findUnique({ where: { productId }, select: { onHand: true, reserved: true } });
  if (!inventory) return;
  const available = inventory.onHand - inventory.reserved;
  if (available < quantity) {
    throw AppError.badRequest(`Insufficient stock available for ${productName} (${available} available)`);
  }
}

// --- Organization-facing reads and the one manual write -------------------

const INVENTORY_SELECT = {
  id: true,
  organizationId: true,
  productId: true,
  onHand: true,
  reserved: true,
  createdAt: true,
  updatedAt: true,
  product: { select: { id: true, name: true, sku: true, unit: true } },
} as const;

function withAvailable<T extends { onHand: number; reserved: number }>(row: T) {
  return { ...row, available: row.onHand - row.reserved };
}

export async function listInventoryForOrganization(organizationId: string, page: number, pageSize: number) {
  const where = { organizationId };
  const [rows, total] = await Promise.all([
    prisma.inventory.findMany({
      where,
      select: INVENTORY_SELECT,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.inventory.count({ where }),
  ]);
  return { inventory: rows.map(withAvailable), page, pageSize, total };
}

async function assertProductBelongsToOrg(organizationId: string, productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, organizationId }, select: { id: true, name: true } });
  if (!product) {
    throw AppError.notFound("Product not found");
  }
  return product;
}

/** Detail view for one product's inventory, including the product even
 * when it has never had an Inventory row created (an explicit
 * `tracked: false` rather than a 404 — the product is real, it simply
 * isn't stock-tracked yet). */
export async function getProductInventoryDetail(organizationId: string, productId: string) {
  const product = await assertProductBelongsToOrg(organizationId, productId);
  const inventory = await prisma.inventory.findUnique({ where: { productId }, select: INVENTORY_SELECT });
  return {
    tracked: inventory !== null,
    product,
    inventory: inventory ? withAvailable(inventory) : null,
  };
}

export async function listStockMovements(organizationId: string, productId: string, page: number, pageSize: number) {
  await assertProductBelongsToOrg(organizationId, productId);
  const inventory = await prisma.inventory.findUnique({ where: { productId }, select: { id: true } });
  if (!inventory) {
    return { movements: [], page, pageSize, total: 0 };
  }
  const where = { inventoryId: inventory.id };
  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      select: {
        id: true,
        type: true,
        quantity: true,
        orderId: true,
        actorUserId: true,
        actorUser: { select: { id: true, name: true } },
        reason: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.stockMovement.count({ where }),
  ]);
  return { movements, page, pageSize, total };
}

/**
 * The one human-initiated inventory write. Initializes tracking (creates
 * the Inventory row with onHand=0) if this product has never been tracked
 * before, then applies the signed adjustment — never below zero onHand.
 * Every adjustment is attributed to the acting user and requires a reason
 * (Rule: no arbitrary unaudited edits), recorded as an ADJUSTMENT
 * StockMovement and an ORGANIZATION-scoped audit log entry, reusing the
 * existing audit architecture rather than a separate inventory log.
 */
export async function adjustInventory(
  organizationId: string,
  productId: string,
  actorUserId: string,
  quantityChange: number,
  reason: string
) {
  const product = await assertProductBelongsToOrg(organizationId, productId);

  const result = await prisma.$transaction(async (tx) => {
    const inventory = await tx.inventory.upsert({
      where: { productId },
      create: { organizationId, productId, onHand: 0, reserved: 0 },
      update: {},
      select: { id: true, onHand: true },
    });

    if (inventory.onHand + quantityChange < 0) {
      throw AppError.badRequest(`Adjustment would take on-hand stock below zero (currently ${inventory.onHand})`);
    }

    await tx.inventory.update({
      where: { id: inventory.id },
      data: { onHand: { increment: quantityChange } },
    });

    await tx.stockMovement.create({
      data: {
        inventoryId: inventory.id,
        type: "ADJUSTMENT",
        quantity: quantityChange,
        actorUserId,
        reason,
      },
    });

    return tx.inventory.findUniqueOrThrow({ where: { id: inventory.id }, select: INVENTORY_SELECT });
  });

  await recordAudit({
    actorUserId,
    organizationId,
    action: "INVENTORY_ADJUSTED",
    targetType: "Inventory",
    targetId: result.id,
    metadata: { productId, productName: product.name, quantityChange, reason },
  });

  return withAvailable(result);
}
