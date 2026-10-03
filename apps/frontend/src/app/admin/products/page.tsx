"use client";

import { useCallback, useEffect, useState } from "react";
import { RequirePlatformAdmin } from "@/components/RequirePlatformAdmin";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuthedFetch } from "@/lib/use-authed-fetch";

interface AdminProductRow {
  id: string;
  name: string;
  status: string;
  isDiscoverable: boolean;
  createdAt: string;
  organization: { id: string; legalName: string; businessType: string };
  category: { id: string; name: string } | null;
}

function AdminProductsContent() {
  const authedFetch = useAuthedFetch();
  const [products, setProducts] = useState<AdminProductRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch<{ products: AdminProductRow[] }>("/admin/products");
      setProducts(res.products);
    } catch {
      setError("Could not load products.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!products) return <p className="text-sm text-text-secondary">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Product catalogue oversight</h1>
      <p className="mt-1 text-sm text-text-secondary">All products across every business, including drafts.</p>

      <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Business</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Visible</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {products.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium text-text-primary">{p.name}</td>
                <td className="px-4 py-3 text-text-secondary">{p.organization.legalName}</td>
                <td className="px-4 py-3 text-text-secondary">{p.category?.name ?? "—"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={p.status} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={p.isDiscoverable ? "ACTIVE" : "SUSPENDED"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminProductsPage() {
  return (
    <RequirePlatformAdmin>
      <AdminProductsContent />
    </RequirePlatformAdmin>
  );
}
