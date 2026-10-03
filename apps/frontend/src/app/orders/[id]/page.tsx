"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { FormAlert } from "@/components/FormAlert";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { formatMinorUnits } from "@/lib/money";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { OrderStatusValue, OrderView } from "@/lib/types";

const LIFECYCLE_STAGES: { status: OrderStatusValue; label: string }[] = [
  { status: "PENDING", label: "Order placed" },
  { status: "CONFIRMED", label: "Confirmed by seller" },
  { status: "PROCESSING", label: "Processing" },
  { status: "COMPLETED", label: "Completed" },
];

/** A terminal stage that has been reached is complete, never "current" —
 * there is no further stage waiting on it (the bug this avoids was found
 * and fixed on the Phase 9 Purchase Order timeline: the last reached stage
 * must render as done, not as perpetually "in progress"). */
function OrderLifecycle({ order }: { order: OrderView }) {
  if (order.status === "CANCELLED") {
    // Cancellation can happen from either PENDING or CONFIRMED, so there is
    // no single fixed point in the linear sequence to place it at — showing
    // a stepper here would misrepresent how far the order actually got.
    // The cancellation banner above already makes the cancelled state
    // unmistakable; a muted, non-committal note is enough here.
    return <p className="text-sm text-text-secondary">This order was cancelled before completion.</p>;
  }

  const stageIndex = LIFECYCLE_STAGES.findIndex((s) => s.status === order.status);

  return (
    <ol className="space-y-0">
      {LIFECYCLE_STAGES.map((stage, i) => {
        const isLastStage = i === LIFECYCLE_STAGES.length - 1;
        const state = i < stageIndex || (i === stageIndex && isLastStage) ? "complete" : i === stageIndex ? "current" : "upcoming";
        return (
          <li key={stage.status} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold ${
                  state === "complete"
                    ? "border-green bg-green text-white"
                    : state === "current"
                      ? "border-navy bg-navy/10 text-navy"
                      : "border-border bg-background text-text-secondary"
                }`}
              >
                {state === "complete" ? "✓" : i + 1}
              </span>
              {i < LIFECYCLE_STAGES.length - 1 && (
                <span className={`w-px flex-1 ${state === "complete" ? "bg-green" : "bg-border"}`} />
              )}
            </div>
            <div className="pb-6">
              <p className={`text-sm font-semibold ${state === "upcoming" ? "text-text-secondary" : "text-text-primary"}`}>
                {stage.label}
                {state === "current" && <span className="ml-2 text-xs font-medium text-navy">In progress</span>}
              </p>
              {stage.status === "PENDING" && <p className="text-xs text-text-secondary">{new Date(order.createdAt).toLocaleString()}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function OrderDetailContent() {
  const params = useParams<{ id: string }>();
  const authedFetch = useAuthedFetch();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrder(await authedFetch<OrderView>(`/orders/${params.id}`));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "This order does not exist, or you do not have access to it."
          : "Could not load this order."
      );
    }
  }, [params.id, authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function performAction(action: "confirm" | "start-processing" | "complete" | "cancel") {
    setActionError(null);
    setBusy(true);
    try {
      setOrder(
        await authedFetch<OrderView>(`/orders/${params.id}/${action}`, {
          method: "POST",
          body: JSON.stringify({}),
        })
      );
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!order) return <p className="text-sm text-text-secondary">Loading…</p>;

  const isSeller = order.viewerRole === "seller";
  const canManage = isSeller && order.viewerSellerRole !== "STAFF";
  const canCancel =
    (order.status === "PENDING" || order.status === "CONFIRMED") && (order.viewerRole === "buyer" || canManage);

  return (
    <div className="max-w-5xl">
      <Link href={isSeller ? "/organizations" : "/orders"} className="text-sm text-text-secondary hover:text-navy">
        ← Back to orders
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy">Order {order.id.slice(0, 8)}</h1>
        <StatusBadge status={order.status} />
      </div>
      <p className="mt-1 text-sm text-text-secondary">
        {isSeller ? `Buyer: ${order.buyerUser.name}` : `Sold by ${order.sellerOrganization.legalName}`} · placed{" "}
        {new Date(order.createdAt).toLocaleString()}
      </p>

      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}

      {order.status === "CANCELLED" && order.cancelReason && (
        <div className="mt-4">
          <FormAlert tone="error">Cancelled: {order.cancelReason}</FormAlert>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card">
            <h2 className="text-lg font-semibold text-text-primary">Items</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-secondary">
                    <th className="py-2 font-medium">Product</th>
                    <th className="py-2 font-medium">Quantity</th>
                    <th className="py-2 font-medium">Unit price</th>
                    <th className="py-2 font-medium text-right">Line total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2">{item.productName}</td>
                      <td className="py-2">
                        {item.quantity} {item.unit.toLowerCase()}
                        {item.quantity !== 1 ? "s" : ""}
                      </td>
                      <td className="py-2">{formatMinorUnits(item.unitPriceMinor, item.currency)}</td>
                      <td className="py-2 text-right font-medium text-navy">{formatMinorUnits(item.lineTotalMinor, item.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end">
              <p className="text-sm font-semibold text-navy">
                Total: {formatMinorUnits(order.totalMinor, order.currency)}
              </p>
            </div>
          </section>

          {(canManage || canCancel) && (
            <section className="card">
              <h2 className="text-sm font-semibold text-text-primary">Actions</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {canManage && order.status === "PENDING" && (
                  <button type="button" disabled={busy} onClick={() => performAction("confirm")} className="btn-primary">
                    Confirm order
                  </button>
                )}
                {canManage && order.status === "CONFIRMED" && (
                  <button type="button" disabled={busy} onClick={() => performAction("start-processing")} className="btn-primary">
                    Start processing
                  </button>
                )}
                {canManage && order.status === "PROCESSING" && (
                  <button type="button" disabled={busy} onClick={() => performAction("complete")} className="btn-primary">
                    Mark completed
                  </button>
                )}
                {canCancel && (
                  <button type="button" disabled={busy} onClick={() => performAction("cancel")} className="btn-destructive">
                    Cancel order
                  </button>
                )}
              </div>
            </section>
          )}
        </div>

        <section className="card h-fit">
          <h2 className="text-sm font-semibold text-text-primary">Status</h2>
          <div className="mt-4">
            <OrderLifecycle order={order} />
          </div>
        </section>
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <RequireAuth>
      <OrderDetailContent />
    </RequireAuth>
  );
}
