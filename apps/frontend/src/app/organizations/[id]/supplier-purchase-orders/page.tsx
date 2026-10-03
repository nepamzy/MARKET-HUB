"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { StatusBadge } from "@/components/StatusBadge";
import { formatMinorUnits } from "@/lib/money";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { PurchaseOrderListEntry } from "@/lib/types";

function SupplierPurchaseOrdersContent() {
  const params = useParams<{ id: string }>();
  const authedFetch = useAuthedFetch();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch<{ purchaseOrders: PurchaseOrderListEntry[] }>(
        `/organizations/${params.id}/supplier-purchase-orders`
      );
      setPurchaseOrders(res.purchaseOrders);
    } catch {
      setError("Could not load purchase orders for this organization.");
    }
  }, [params.id, authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Purchase orders received</h1>
      <p className="mt-1 text-sm text-text-secondary">Purchase orders buyers have issued to your organization.</p>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      {purchaseOrders === null && !error && <p className="mt-6 text-sm text-text-secondary">Loading…</p>}

      {purchaseOrders && purchaseOrders.length === 0 && (
        <div className="mt-6 rounded-control border border-dashed border-border p-8 text-center">
          <p className="text-sm text-text-secondary">No purchase orders received yet.</p>
        </div>
      )}

      {purchaseOrders && purchaseOrders.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Buyer</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {purchaseOrders.map((po) => (
                <tr key={po.id} className="hover:bg-background">
                  <td className="px-4 py-3">
                    <Link href={`/purchase-orders/${po.id}`} className="font-medium text-text-primary hover:text-green-dark">
                      {po.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{po.buyerOrganizationName}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={po.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-navy">{formatMinorUnits(po.totalMinor, po.currency)}</td>
                  <td className="px-4 py-3 text-text-secondary">{new Date(po.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SupplierPurchaseOrdersPage() {
  return (
    <RequireAuth>
      <SupplierPurchaseOrdersContent />
    </RequireAuth>
  );
}
