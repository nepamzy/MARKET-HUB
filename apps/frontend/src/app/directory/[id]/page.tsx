"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { DirectoryListing } from "@/lib/types";

function DirectoryDetailContent() {
  const params = useParams<{ id: string }>();
  const authedFetch = useAuthedFetch();
  const [org, setOrg] = useState<DirectoryListing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOrg(await authedFetch<DirectoryListing>(`/directory/${params.id}`));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "This business is not currently listed in the directory."
          : "Could not load this business."
      );
    }
  }, [params.id, authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!org) return <p className="text-sm text-text-secondary">Loading…</p>;

  const sp = org.supplierProfile;

  return (
    <div>
      <Link href="/directory" className="text-sm text-text-secondary hover:text-navy">
        ← Back to directory
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy">{org.legalName}</h1>
        <StatusBadge status={org.verificationStatus} />
      </div>
      <p className="mt-1 text-sm text-text-secondary">
        {org.businessType.replace(/_/g, " ")} · {org.city ? `${org.city}, ` : ""}
        {org.country ?? "Location not specified"}
      </p>

      {org.description && <p className="card mt-6 text-sm text-text-primary">{org.description}</p>}

      <section className="card mt-6">
        <h2 className="text-lg font-semibold text-text-primary">Supplier information</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-text-secondary">Capabilities</dt>
            <dd className="mt-1 text-sm text-text-primary">
              {sp.capabilities.length > 0 ? sp.capabilities.join(", ").replace(/_/g, " ") : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-text-secondary">Categories</dt>
            <dd className="mt-1 text-sm text-text-primary">
              {sp.categories.length > 0 ? sp.categories.join(", ") : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-text-secondary">Countries served</dt>
            <dd className="mt-1 text-sm text-text-primary">
              {sp.countriesServed.length > 0 ? sp.countriesServed.join(", ") : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-text-secondary">Minimum order</dt>
            <dd className="mt-1 text-sm text-text-primary">{sp.minimumOrderInfo ?? "—"}</dd>
          </div>
        </dl>
      </section>

      {(org.contactEmail || org.contactPhone) && (
        <section className="card mt-6">
          <h2 className="text-lg font-semibold text-text-primary">Contact</h2>
          <p className="mt-2 text-sm text-text-primary">{org.contactEmail}</p>
          <p className="text-sm text-text-primary">{org.contactPhone}</p>
        </section>
      )}
    </div>
  );
}

export default function DirectoryDetailPage() {
  return (
    <RequireAuth>
      <DirectoryDetailContent />
    </RequireAuth>
  );
}
