import { afterAll, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma";

/**
 * Truncates every application table before each test so tests are
 * independent and order-agnostic. Runs against `markethub_test` only —
 * never point TEST_DATABASE_URL at a real database.
 */
async function resetDatabase(): Promise<void> {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.organizationMembership.deleteMany(),
    // Order/OrderItem use onDelete:Restrict on their User/Organization
    // relations (Phase 6 — historical records must never silently vanish
    // via cascade), so unlike every other domain table here, they can't
    // rely on deleting Organization/User to clean them up transitively.
    // Children before parents: OrderItem before Order, CartItem before
    // Cart (though those two do cascade — deleted explicitly anyway for
    // clarity and so test runs never depend on cascade ordering).
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.cartItem.deleteMany(),
    prisma.cart.deleteMany(),
    // Phase 7 procurement tables — same reasoning: Requisition/Rfq/
    // SupplierResponse all use onDelete:Restrict on their Organization/User
    // relations, so they must be cleared explicitly before Organization/
    // User, children before parents.
    prisma.supplierResponseItem.deleteMany(),
    prisma.supplierResponse.deleteMany(),
    prisma.rfqSupplierTarget.deleteMany(),
    prisma.rfqItem.deleteMany(),
    prisma.rfq.deleteMany(),
    prisma.requisitionItem.deleteMany(),
    prisma.requisition.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});
