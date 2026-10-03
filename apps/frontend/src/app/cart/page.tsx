"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { FormAlert } from "@/components/FormAlert";
import { ApiError } from "@/lib/api";
import { formatMinorUnits } from "@/lib/money";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { CartItemView, CartView } from "@/lib/types";

function QuantityStepper({ value, onChange, disabled }: { value: number; onChange: (next: number) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center rounded-control border border-border">
      <button
        type="button"
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
        className="flex h-9 w-9 items-center justify-center text-text-secondary hover:text-navy disabled:opacity-40"
        aria-label="Decrease quantity"
      >
        −
      </button>
      <input
        type="number"
        min={1}
        disabled={disabled}
        className="h-9 w-14 border-x border-border bg-transparent text-center text-sm focus:outline-none"
        value={value}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(value + 1)}
        className="flex h-9 w-9 items-center justify-center text-text-secondary hover:text-navy disabled:opacity-40"
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}

function CartLineItem({
  item,
  onUpdateQuantity,
  onRemove,
}: {
  item: CartItemView;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
}) {
  return (
    <div className={`card flex flex-wrap items-center justify-between gap-3 ${!item.valid ? "border-danger/30 bg-danger/5" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-text-primary">{item.productName ?? "Unknown product"}</p>
        {!item.valid && (
          <p className="mt-1 flex items-center gap-1 text-sm text-danger">
            <span aria-hidden="true">⚠</span> {item.invalidReason ?? "This item is no longer available"}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <QuantityStepper value={item.quantity} onChange={(next) => onUpdateQuantity(item.id, next)} />
        {item.valid && item.unitPriceMinor != null && item.currency && (
          <div className="w-28 text-right">
            <p className="text-sm font-medium text-navy">{formatMinorUnits(item.lineTotalMinor ?? 0, item.currency)}</p>
            <p className="text-xs text-text-secondary">{formatMinorUnits(item.unitPriceMinor, item.currency)} each</p>
          </div>
        )}
        <button type="button" onClick={() => onRemove(item.id)} className="btn-tertiary text-sm text-danger">
          Remove
        </button>
      </div>
    </div>
  );
}

function CartContent() {
  const router = useRouter();
  const authedFetch = useAuthedFetch();
  const [cart, setCart] = useState<CartView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  // Groups by seller so a multi-seller cart never reads as a single order —
  // checkout decomposes it into one independent Order per seller/currency,
  // and the UI should make that composition obvious before the buyer commits.
  const sellerGroups = useMemo(() => {
    const groups = new Map<string, { sellerOrganizationName: string | null; items: CartItemView[] }>();
    const invalid: CartItemView[] = [];
    for (const item of cart?.items ?? []) {
      if (!item.valid || !item.sellerOrganizationId) {
        invalid.push(item);
        continue;
      }
      const key = item.sellerOrganizationId;
      const group = groups.get(key);
      if (group) group.items.push(item);
      else groups.set(key, { sellerOrganizationName: item.sellerOrganizationName ?? null, items: [item] });
    }
    return { valid: Array.from(groups.values()), invalid };
  }, [cart]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!cart) return <p className="text-sm text-text-secondary">Loading…</p>;

  const hasInvalidItems = cart.items.some((item) => !item.valid);
  const canCheckout = cart.items.length > 0 && !hasInvalidItems;
  const sellerCount = sellerGroups.valid.length;

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
          <div className="space-y-6 lg:col-span-2">
            {sellerGroups.valid.map((group) => (
              <div key={group.items[0]!.sellerOrganizationId} className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Sold by {group.sellerOrganizationName ?? "this seller"}
                </p>
                {group.items.map((item) => (
                  <CartLineItem key={item.id} item={item} onUpdateQuantity={updateQuantity} onRemove={removeItem} />
                ))}
              </div>
            ))}

            {sellerGroups.invalid.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-danger">Needs attention</p>
                {sellerGroups.invalid.map((item) => (
                  <CartLineItem key={item.id} item={item} onUpdateQuantity={updateQuantity} onRemove={removeItem} />
                ))}
              </div>
            )}
          </div>

          <aside className="card h-fit">
            <h2 className="text-sm font-semibold text-text-primary">Summary</h2>
            {sellerCount > 1 && (
              <p className="mt-2 rounded-control bg-background px-3 py-2 text-xs text-text-secondary">
                Items from {sellerCount} sellers will become {sellerCount} separate orders at checkout.
              </p>
            )}
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
            <button
              type="button"
              onClick={() => router.push("/checkout")}
              disabled={!canCheckout}
              className="btn-primary mt-4 w-full"
            >
              Review checkout
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
