"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { FormAlert } from "@/components/FormAlert";
import { ApiError } from "@/lib/api";
import { formatMinorUnits } from "@/lib/money";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { CartItemView, CartView, OrderView } from "@/lib/types";

function groupBySeller(cart: CartView) {
  const groups = new Map<string, { sellerOrganizationName: string | null; currency: string; items: CartItemView[]; subtotalMinor: number }>();
  for (const item of cart.items) {
    if (!item.valid || !item.sellerOrganizationId || !item.currency) continue;
    // Checkout decomposes by (seller, currency) — the existing "one Order
    // per seller/currency pair" decision — so the review groups the same
    // way, never implying one seller's mixed-currency items become one order.
    const key = `${item.sellerOrganizationId}:${item.currency}`;
    const group = groups.get(key);
    if (group) {
      group.items.push(item);
      group.subtotalMinor += item.lineTotalMinor ?? 0;
    } else {
      groups.set(key, {
        sellerOrganizationName: item.sellerOrganizationName ?? null,
        currency: item.currency,
        items: [item],
        subtotalMinor: item.lineTotalMinor ?? 0,
      });
    }
  }
  return Array.from(groups.values());
}

function CheckoutContent() {
  const authedFetch = useAuthedFetch();
  const [cart, setCart] = useState<CartView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [createdOrders, setCreatedOrders] = useState<OrderView[] | null>(null);

  const load = useCallback(async () => {
    try {
      setCart(await authedFetch<CartView>("/cart"));
    } catch {
      setLoadError("Could not load your cart.");
    }
  }, [authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => (cart ? groupBySeller(cart) : []), [cart]);

  async function placeOrder() {
    setCheckoutError(null);
    setPlacing(true);
    try {
      const result = await authedFetch<{ orders: OrderView[] }>("/checkout", { method: "POST" });
      setCreatedOrders(result.orders);
    } catch (err) {
      setCheckoutError(err instanceof ApiError ? err.message : "Checkout failed. Please try again.");
      // Re-fetch in case what changed (e.g. an item went out of stock
      // between loading this page and confirming) is now reflected.
      await load();
    } finally {
      setPlacing(false);
    }
  }

  // --- Confirmation view: real, successfully created orders only. No
  // payment step exists in this phase — there is nothing to "pay" here. ---
  if (createdOrders) {
    return (
      <div className="max-w-xl">
        <div className="card text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-2xl text-success" aria-hidden="true">
            ✓
          </div>
          <h1 className="mt-4 text-xl font-semibold text-navy">
            {createdOrders.length === 1 ? "Order placed" : `${createdOrders.length} orders placed`}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {createdOrders.length === 1
              ? "Your order has been created."
              : `Your cart's items were from ${createdOrders.length} different sellers, so ${createdOrders.length} independent orders were created.`}
          </p>
        </div>

        <div className="mt-6 space-y-3">
          {createdOrders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="card flex items-center justify-between gap-3 hover:border-green-dark"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-text-primary">{order.sellerOrganization.legalName}</p>
                <p className="text-xs text-text-secondary">
                  {order.totalQuantity} item{order.totalQuantity === 1 ? "" : "s"}
                </p>
              </div>
              <p className="shrink-0 font-medium text-navy">{formatMinorUnits(order.totalMinor, order.currency)}</p>
            </Link>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/orders" className="btn-primary">
            View all orders
          </Link>
          <Link href="/marketplace" className="btn-secondary">
            Continue shopping
          </Link>
        </div>
      </div>
    );
  }

  if (loadError) return <p className="text-sm text-danger">{loadError}</p>;
  if (!cart) return <p className="text-sm text-text-secondary">Loading…</p>;

  const hasInvalidItems = cart.items.some((item) => !item.valid);

  if (cart.items.length === 0) {
    return (
      <div className="rounded-control border border-dashed border-border p-8 text-center">
        <p className="text-sm text-text-secondary">Your cart is empty — there&apos;s nothing to check out.</p>
        <Link href="/marketplace" className="btn-primary mt-4 inline-flex">
          Browse the marketplace
        </Link>
      </div>
    );
  }

  if (hasInvalidItems) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-navy">Checkout</h1>
        <div className="mt-4">
          <FormAlert>Some items in your cart need attention before you can check out.</FormAlert>
        </div>
        <Link href="/cart" className="btn-primary mt-4 inline-flex">
          Back to cart
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <Link href="/cart" className="text-sm text-text-secondary hover:text-navy">
        ← Back to cart
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-navy">Checkout</h1>
      <p className="mt-1 text-sm text-text-secondary">
        {groups.length === 1
          ? "Review your order before you confirm."
          : `Review your order before you confirm. Items from ${groups.length} sellers will become ${groups.length} separate orders.`}
      </p>

      {checkoutError && (
        <div className="mt-4">
          <FormAlert>{checkoutError}</FormAlert>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {groups.map((group) => (
          <section key={`${group.sellerOrganizationName}-${group.currency}`} className="card">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-text-primary">{group.sellerOrganizationName ?? "Seller"}</h2>
              <p className="text-xs text-text-secondary">One order · {group.currency}</p>
            </div>
            <div className="mt-3 divide-y divide-border">
              {group.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-text-primary">{item.productName}</p>
                    <p className="text-xs text-text-secondary">
                      {item.quantity} {item.unit?.toLowerCase()} × {formatMinorUnits(item.unitPriceMinor ?? 0, item.currency!)}
                    </p>
                  </div>
                  <p className="shrink-0 font-medium text-navy">{formatMinorUnits(item.lineTotalMinor ?? 0, item.currency!)}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end border-t border-border pt-3">
              <p className="text-sm font-semibold text-navy">
                Order total: {formatMinorUnits(group.subtotalMinor, group.currency)}
              </p>
            </div>
          </section>
        ))}
      </div>

      <div className="card mt-6">
        <h2 className="text-sm font-semibold text-text-primary">Payment</h2>
        <p className="mt-1 text-sm text-text-secondary">
          No payment is collected at this stage. Confirming creates your order(s) for the seller(s) to fulfil.
        </p>
        <button type="button" disabled={placing} onClick={placeOrder} className="btn-primary mt-4 w-full">
          {placing ? "Placing order…" : groups.length === 1 ? "Confirm order" : `Confirm ${groups.length} orders`}
        </button>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <RequireAuth>
      <CheckoutContent />
    </RequireAuth>
  );
}
