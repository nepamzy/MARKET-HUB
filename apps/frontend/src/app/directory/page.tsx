"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { DirectoryListing } from "@/lib/types";

function DirectoryContent() {
  const authedFetch = useAuthedFetch();
  const [results, setResults] = useState<DirectoryListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capability, setCapability] = useState("");
  const [country, setCountry] = useState("");

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams();
      if (capability) query.set("capability", capability);
      if (country) query.set("country", country);
      const res = await authedFetch<{ organizations: DirectoryListing[] }>(
        `/directory${query.toString() ? `?${query.toString()}` : ""}`
      );
      setResults(res.organizations);
    } catch {
      setError("Could not load the business directory.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capability, country]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Business directory</h1>
      <p className="mt-1 text-sm text-text-secondary">Discover suppliers and businesses on Market Hub.</p>

      <div className="card mt-6 flex flex-wrap gap-3">
        <select value={capability} onChange={(e) => setCapability(e.target.value)} className="field-input sm:w-52">
          <option value="">Any capability</option>
          {["MANUFACTURER", "DISTRIBUTOR", "WHOLESALER", "RETAILER", "SERVICE_PROVIDER", "OTHER"].map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="Country"
          className="field-input sm:w-52"
        />
      </div>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      {results === null && !error && <p className="mt-6 text-sm text-text-secondary">Loading…</p>}
      {results && results.length === 0 && (
        <p className="mt-6 text-sm text-text-secondary">No businesses match these filters yet.</p>
      )}

      {results && results.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {results.map((org) => (
            <Link
              key={org.id}
              href={`/directory/${org.id}`}
              className="card block transition hover:border-navy/30"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-text-primary">{org.legalName}</h2>
                <StatusBadge status={org.verificationStatus} />
              </div>
              <p className="mt-1 text-sm text-text-secondary">
                {org.city ? `${org.city}, ` : ""}
                {org.country ?? "Location not specified"}
              </p>
              {org.supplierProfile.capabilities.length > 0 && (
                <p className="mt-2 text-xs uppercase tracking-wide text-text-secondary">
                  {org.supplierProfile.capabilities.join(" · ")}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DirectoryPage() {
  return (
    <RequireAuth>
      <DirectoryContent />
    </RequireAuth>
  );
}
