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
import type { OrderView } from "@/lib/types";

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
    <div className="max-w-3xl">
      <Link href={isSeller ? "/organizations" : "/orders"} className="text-sm text-text-secondary hover:text-navy">
        ← Back to orders
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy">Order {order.id.slice(0, 8)}</h1>
        <StatusBadge status={order.status} />
      </div>
      <p className="mt-1 text-sm text-text-secondary">
        {isSeller ? "Buyer order" : `Sold by ${order.sellerOrganization.legalName}`} · placed{" "}
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

      <section className="card mt-6">
        <h2 className="text-lg font-semibold text-text-primary">Items</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-2 font-medium">Product</th>
                <th className="py-2 font-medium">Quantity</th>
                <th className="py-2 font-medium">Unit price</th>
                <th className="py-2 font-medium">Line total</th>
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
                  <td className="py-2 font-medium text-navy">{formatMinorUnits(item.lineTotalMinor, item.currency)}</td>
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
        <section className="card mt-6">
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
  );
}

export default function OrderDetailPage() {
  return (
    <RequireAuth>
      <OrderDetailContent />
    </RequireAuth>
  );
}
