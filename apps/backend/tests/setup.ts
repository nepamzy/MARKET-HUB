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
    // Phase 10 — Payment uses onDelete:Restrict on its Order/User
    // relations, so it must be cleared before both. PaymentWebhookEvent
    // uses onDelete:SetNull on Payment, so order between the two doesn't
    // strictly matter, but deleting it first keeps the intent clear.
    prisma.paymentWebhookEvent.deleteMany(),
    prisma.payment.deleteMany(),
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
    // Phase 9 — PurchaseOrder/PurchaseOrderItem use onDelete:Restrict on
    // Award/Rfq/SupplierResponse/Organization/User, so both must be
    // cleared before any of those, and specifically before Award below
    // (PurchaseOrder.awardId is Restrict).
    prisma.purchaseOrderItem.deleteMany(),
    prisma.purchaseOrder.deleteMany(),
    // Phase 8 procurement tables — Negotiation/Award both use
    // onDelete:Restrict on their Rfq/SupplierResponse/Organization
    // relations, so they must be cleared before Rfq/SupplierResponse
    // (which Phase 7's own tables below also still need, in the same
    // order as before). NegotiationEventItem similarly must precede
    // RfqItem (onDelete:Restrict on rfqItemId).
    prisma.negotiationEventItem.deleteMany(),
    prisma.negotiationEvent.deleteMany(),
    prisma.negotiation.deleteMany(),
    prisma.award.deleteMany(),
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
