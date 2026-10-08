"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { ApiError } from "@/lib/api";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { InventoryRow, OrganizationProduct } from "@/lib/types";

function InventoryContent() {
  const params = useParams<{ id: string }>();
  const organizationId = params.id;
  const authedFetch = useAuthedFetch();

  const [inventory, setInventory] = useState<InventoryRow[] | null>(null);
  const [untrackedProducts, setUntrackedProducts] = useState<OrganizationProduct[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [inventoryRes, productsRes] = await Promise.all([
        authedFetch<{ inventory: InventoryRow[] }>(`/organizations/${organizationId}/inventory`),
        authedFetch<{ products: OrganizationProduct[] }>(`/organizations/${organizationId}/products`),
      ]);
      setInventory(inventoryRes.inventory);
      const trackedIds = new Set(inventoryRes.inventory.map((i) => i.productId));
      setUntrackedProducts(productsRes.products.filter((p) => !trackedIds.has(p.id)));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 403
          ? "You do not have access to this business."
          : "Could not load inventory."
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!inventory) return <p className="text-sm text-text-secondary">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Inventory</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Stock on hand, reserved to open orders, and what&apos;s actually available to sell. A product only appears
        with real numbers here once stock tracking has been started for it — see &quot;Not yet tracked&quot; below.
      </p>

      {inventory.length === 0 ? (
        <p className="mt-6 text-sm text-text-secondary">No products are stock-tracked yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium text-right">On hand</th>
                <th className="px-4 py-3 font-medium text-right">Reserved</th>
                <th className="px-4 py-3 font-medium text-right">Available</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {inventory.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium text-text-primary">{row.product.name}</td>
                  <td className="px-4 py-3 text-right">{row.onHand.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">{row.reserved.toLocaleString()}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${row.available <= 0 ? "text-danger" : "text-text-primary"}`}>
                    {row.available.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/organizations/${organizationId}/inventory/${row.productId}`} className="btn-tertiary px-0 text-sm">
                      Details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {untrackedProducts.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-text-primary">Not yet tracked</h2>
          <p className="mt-1 text-sm text-text-secondary">
            These products sell with no quantity limit. Open one to start tracking stock for it.
          </p>
          <div className="mt-3 overflow-x-auto rounded-card border border-dashed border-border">
            <table className="w-full min-w-[400px] text-sm">
              <tbody className="divide-y divide-border">
                {untrackedProducts.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 text-text-primary">{p.name}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/organizations/${organizationId}/inventory/${p.id}`} className="btn-tertiary px-0 text-sm">
                        Start tracking
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrganizationInventoryPage() {
  return (
    <RequireAuth>
      <InventoryContent />
    </RequireAuth>
  );
}
