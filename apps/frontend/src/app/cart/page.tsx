"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { FormAlert } from "@/components/FormAlert";
import { ApiError } from "@/lib/api";
import { formatMinorUnits } from "@/lib/money";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { CartView, OrderView } from "@/lib/types";

function CartContent() {
  const router = useRouter();
  const authedFetch = useAuthedFetch();
  const [cart, setCart] = useState<CartView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  const load = useCallback(async () => {
    try {
      setCart(await authedFetch<CartView>("/cart"));
    } catch {
      setError("Could not load your cart.");
    }
  }, [authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateQuantity(itemId: string, quantity: number) {
    setActionError(null);
    try {
      setCart(await authedFetch<CartView>(`/cart/items/${itemId}`, { method: "PATCH", body: JSON.stringify({ quantity }) }));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not update that item.");
    }
  }

  async function removeItem(itemId: string) {
    setActionError(null);
    try {
      setCart(await authedFetch<CartView>(`/cart/items/${itemId}`, { method: "DELETE" }));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not remove that item.");
    }
  }

  async function handleCheckout() {
    setActionError(null);
    setCheckingOut(true);
    try {
      const result = await authedFetch<{ orders: OrderView[] }>("/checkout", { method: "POST" });
      if (result.orders.length === 1) {
        router.push(`/orders/${result.orders[0]!.id}`);
      } else {
        router.push("/orders");
      }
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Checkout failed. Please try again.");
    } finally {
      setCheckingOut(false);
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!cart) return <p className="text-sm text-text-secondary">Loading…</p>;

  const hasInvalidItems = cart.items.some((item) => !item.valid);
  const canCheckout = cart.items.length > 0 && !hasInvalidItems;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Your cart</h1>

      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}

      {cart.items.length === 0 ? (
        <div className="mt-6 rounded-control border border-dashed border-border p-8 text-center">
          <p className="text-sm text-text-secondary">Your cart is empty.</p>
          <Link href="/marketplace" className="btn-primary mt-4 inline-flex">
            Browse the marketplace
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            {cart.items.map((item) => (
              <div key={item.id} className="card flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-text-primary">{item.productName ?? "Unknown product"}</p>
                  {item.sellerOrganizationName && (
                    <p className="text-xs text-text-secondary">Sold by {item.sellerOrganizationName}</p>
                  )}
                  {!item.valid && <p className="mt-1 text-sm text-danger">{item.invalidReason}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    className="field-input w-20"
                    value={item.quantity}
                    onChange={(e) => updateQuantity(item.id, Math.max(1, Number(e.target.value)))}
                  />
                  {item.valid && item.unitPriceMinor != null && item.currency && (
                    <p className="w-28 text-right text-sm font-medium text-navy">
                      {formatMinorUnits(item.lineTotalMinor ?? 0, item.currency)}
                    </p>
                  )}
                  <button type="button" onClick={() => removeItem(item.id)} className="btn-tertiary text-sm text-danger">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <aside className="card h-fit">
            <h2 className="text-sm font-semibold text-text-primary">Summary</h2>
            <dl className="mt-3 space-y-1 text-sm">
              {Object.entries(cart.subtotalByCurrency).map(([currency, amountMinor]) => (
                <div key={currency} className="flex justify-between">
                  <dt className="text-text-secondary">Subtotal ({currency})</dt>
                  <dd className="font-medium text-navy">{formatMinorUnits(amountMinor, currency)}</dd>
                </div>
              ))}
              {Object.keys(cart.subtotalByCurrency).length === 0 && (
                <p className="text-text-secondary">Resolve the issues above before checking out.</p>
              )}
            </dl>
            <button type="button" onClick={handleCheckout} disabled={!canCheckout || checkingOut} className="btn-primary mt-4 w-full">
              {checkingOut ? "Placing order…" : "Checkout"}
            </button>
            {hasInvalidItems && (
              <p className="mt-2 text-xs text-text-secondary">Remove or fix unavailable items to continue.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

export default function CartPage() {
  return (
    <RequireAuth>
      <CartContent />
    </RequireAuth>
  );
}
