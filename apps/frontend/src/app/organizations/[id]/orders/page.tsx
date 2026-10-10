"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { StatusBadge } from "@/components/StatusBadge";
import { formatMinorUnits } from "@/lib/money";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { OrderView } from "@/lib/types";

function OrganizationOrdersContent() {
  const params = useParams<{ id: string }>();
  const authedFetch = useAuthedFetch();
  const [orders, setOrders] = useState<OrderView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<{ orders: OrderView[] }>(`/organizations/${params.id}/orders`)
      .then((res) => setOrders(res.orders))
      .catch(() => setError("Could not load orders for this organization."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Orders</h1>
      <p className="mt-1 text-sm text-text-secondary">Orders placed by customers for this organization.</p>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      {orders === null && !error && <p className="mt-6 text-sm text-text-secondary">Loading…</p>}

      {orders && orders.length === 0 && (
        <div className="mt-6 rounded-control border border-dashed border-border p-8 text-center">
          <p className="text-sm text-text-secondary">No orders yet.</p>
        </div>
      )}

      {orders && orders.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Buyer</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Placed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-background">
                  <td className="px-4 py-3">
                    <Link href={`/orders/${order.id}`} className="font-medium text-text-primary hover:text-green-dark">
                      {order.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{order.buyerUser.name}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {order.totalQuantity} item{order.totalQuantity === 1 ? "" : "s"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-navy">{formatMinorUnits(order.totalMinor, order.currency)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{new Date(order.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function OrganizationOrdersPage() {
  return (
    <RequireAuth>
      <OrganizationOrdersContent />
    </RequireAuth>
  );
}
