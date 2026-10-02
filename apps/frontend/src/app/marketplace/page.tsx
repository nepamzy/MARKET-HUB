"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { StatusBadge } from "@/components/StatusBadge";
import { formatMinorUnits } from "@/lib/money";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { PublicProduct } from "@/lib/types";

function MarketplaceContent() {
  const authedFetch = useAuthedFetch();
  const [results, setResults] = useState<PublicProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const query = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await authedFetch<{ products: PublicProduct[] }>(`/products${query}`);
      setResults(res.products);
    } catch {
      setError("Could not load the marketplace.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Marketplace</h1>
      <p className="mt-1 text-sm text-text-secondary">Browse products published by businesses on Market Hub.</p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search products…"
        className="field-input mt-6 sm:w-80"
      />

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      {results === null && !error && <p className="mt-6 text-sm text-text-secondary">Loading…</p>}
      {results && results.length === 0 && (
        <p className="mt-6 text-sm text-text-secondary">No products match yet.</p>
      )}

      {results && results.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((p) => (
            <Link key={p.id} href={`/marketplace/${p.id}`} className="card block transition hover:border-navy/30">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-text-primary">{p.name}</h2>
                <StatusBadge status={p.commercialOffer?.availability ?? "AVAILABLE"} />
              </div>
              <p className="mt-1 text-xs text-text-secondary">{p.organization.legalName}</p>
              {p.prices[0] && (
                <p className="mt-2 text-sm font-medium text-navy">
                  {formatMinorUnits(p.prices[0].unitPriceMinor, p.prices[0].currency)} / {p.unit.toLowerCase()}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MarketplacePage() {
  return (
    <RequireAuth>
      <MarketplaceContent />
    </RequireAuth>
  );
}
