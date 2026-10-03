import { recordAudit } from "../../lib/audit";
import { resolvePurchaseTerms } from "../../lib/commercePricing";
import { AppError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";

/**
 * The caller's current active cart, creating one if none exists. "Active"
 * means checkedOutAt IS NULL — a checked-out cart is spent and never
 * reused (see schema.prisma's Cart doc comment for the idempotency
 * rationale).
 */
async function getOrCreateActiveCart(buyerUserId: string) {
  const existing = await prisma.cart.findFirst({ where: { buyerUserId, checkedOutAt: null } });
  if (existing) return existing;
  return prisma.cart.create({ data: { buyerUserId } });
}

interface CartItemView {
  id: string;
  productId: string;
  quantity: number;
  valid: boolean;
  invalidReason?: string;
  productName?: string;
  unit?: string;
  sellerOrganizationId?: string;
  sellerOrganizationName?: string;
  unitPriceMinor?: number;
  currency?: string;
  lineTotalMinor?: number;
}

/**
 * Resolves every item against LIVE product/price/availability data — never
 * the price that happened to be true when the item was added. An item that
 * no longer resolves (discontinued, hidden, quantity now invalid) is kept
 * in the response as `valid: false` with a reason, rather than silently
 * dropped or silently priced at zero, so the frontend can show the buyer
 * exactly what needs fixing before checkout.
 */
export async function getCartView(buyerUserId: string) {
  const cart = await getOrCreateActiveCart(buyerUserId);
  const items = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    select: { id: true, productId: true, quantity: true },
    orderBy: { createdAt: "asc" },
  });

  const resolvedItems: CartItemView[] = await Promise.all(
    items.map(async (item): Promise<CartItemView> => {
      try {
        const terms = await resolvePurchaseTerms(item.productId, item.quantity);
        return {
          id: item.id,
          productId: item.productId,
          quantity: item.quantity,
          valid: true,
          productName: terms.productName,
          unit: terms.unit,
          sellerOrganizationId: terms.sellerOrganizationId,
          sellerOrganizationName: terms.sellerOrganizationName,
          unitPriceMinor: terms.unitPriceMinor,
          currency: terms.currency,
          lineTotalMinor: terms.lineTotalMinor,
        };
      } catch (err) {
        return {
          id: item.id,
          productId: item.productId,
          quantity: item.quantity,
          valid: false,
          invalidReason: err instanceof AppError ? err.message : "This item is no longer available",
        };
      }
    })
  );

  // Subtotal grouped by currency — a cart may legitimately span multiple
  // currencies (Phase 6 §16: never combine amounts across currencies).
  const subtotalByCurrency: Record<string, number> = {};
  let totalQuantity = 0;
  for (const item of resolvedItems) {
    if (!item.valid || !item.currency || item.lineTotalMinor == null) continue;
    subtotalByCurrency[item.currency] = (subtotalByCurrency[item.currency] ?? 0) + item.lineTotalMinor;
    totalQuantity += item.quantity;
  }

  return { cartId: cart.id, items: resolvedItems, subtotalByCurrency, totalQuantity };
}

export async function addCartItem(buyerUserId: string, productId: string, quantity: number) {
  // Validate before touching the cart at all — an item that can't resolve
  // shouldn't be added in the first place (Phase 6 §8).
  await resolvePurchaseTerms(productId, quantity);

  const cart = await getOrCreateActiveCart(buyerUserId);
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_productId: { cartId: cart.id, productId } },
  });

  if (existing) {
    const newQuantity = existing.quantity + quantity;
    await resolvePurchaseTerms(productId, newQuantity);
    await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: newQuantity } });
  } else {
    await prisma.cartItem.create({ data: { cartId: cart.id, productId, quantity } });
  }

  await recordAudit({
    actorUserId: buyerUserId,
    action: "CART_ITEM_ADDED",
    targetType: "Product",
    targetId: productId,
    metadata: { quantity },
  });

  return getCartView(buyerUserId);
}

async function getOwnedCartItem(buyerUserId: string, itemId: string) {
  const item = await prisma.cartItem.findUnique({
    where: { id: itemId },
    select: { id: true, productId: true, cart: { select: { id: true, buyerUserId: true, checkedOutAt: true } } },
  });
  // Identical "not found" whether the item doesn't exist or belongs to
  // someone else's cart — never confirm another user's cart contents exist.
  if (!item || item.cart.buyerUserId !== buyerUserId || item.cart.checkedOutAt) {
    throw AppError.notFound("Cart item not found");
  }
  return item;
}

export async function updateCartItemQuantity(buyerUserId: string, itemId: string, quantity: number) {
  const item = await getOwnedCartItem(buyerUserId, itemId);
  await resolvePurchaseTerms(item.productId, quantity);

  await prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });

  await recordAudit({
    actorUserId: buyerUserId,
    action: "CART_ITEM_UPDATED",
    targetType: "Product",
    targetId: item.productId,
    metadata: { quantity },
  });

  return getCartView(buyerUserId);
}

export async function removeCartItem(buyerUserId: string, itemId: string) {
  const item = await getOwnedCartItem(buyerUserId, itemId);
  await prisma.cartItem.delete({ where: { id: itemId } });

  await recordAudit({
    actorUserId: buyerUserId,
    action: "CART_ITEM_REMOVED",
    targetType: "Product",
    targetId: item.productId,
  });

  return getCartView(buyerUserId);
}

export async function clearCart(buyerUserId: string) {
  const cart = await getOrCreateActiveCart(buyerUserId);
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  return getCartView(buyerUserId);
}
