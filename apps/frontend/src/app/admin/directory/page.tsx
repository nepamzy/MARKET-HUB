"use client";

import { useCallback, useEffect, useState } from "react";
import { RequirePlatformAdmin } from "@/components/RequirePlatformAdmin";
import { FormAlert } from "@/components/FormAlert";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { AdminDirectoryEntry } from "@/lib/types";

function AdminDirectoryContent() {
  const authedFetch = useAuthedFetch();
  const [entries, setEntries] = useState<AdminDirectoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch<{ organizations: AdminDirectoryEntry[] }>("/admin/directory");
      setEntries(res.organizations);
    } catch {
      setError("Could not load the directory.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggle(organizationId: string, next: boolean) {
    setActionError(null);
    try {
      await authedFetch(`/admin/directory/${organizationId}/visibility`, {
        method: "PATCH",
        body: JSON.stringify({ isDiscoverable: next }),
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not update visibility.");
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!entries) return <p className="text-sm text-text-secondary">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Directory oversight</h1>
      <p className="mt-1 text-sm text-text-secondary">
        All businesses, including those not currently visible in the public directory.
      </p>

      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th className="px-4 py-3 font-medium">Business</th>
              <th className="px-4 py-3 font-medium">Verification</th>
              <th className="px-4 py-3 font-medium">Supplier profile</th>
              <th className="px-4 py-3 font-medium">Directory visibility</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map((org) => (
              <tr key={org.id}>
                <td className="px-4 py-3 font-medium text-text-primary">{org.legalName}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={org.verificationStatus} />
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {org.supplierProfile ? org.supplierProfile.capabilities.join(", ").replace(/_/g, " ") || "—" : "Not configured"}
                </td>
                <td className="px-4 py-3">
                  {org.supplierProfile ? (
                    <StatusBadge status={org.supplierProfile.isDiscoverable ? "ACTIVE" : "SUSPENDED"} />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  {org.supplierProfile && (
                    <button
                      type="button"
                      onClick={() => handleToggle(org.id, !org.supplierProfile!.isDiscoverable)}
                      className="btn-tertiary px-0 text-sm"
                    >
                      {org.supplierProfile.isDiscoverable ? "Hide" : "Show"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminDirectoryPage() {
  return (
    <RequirePlatformAdmin>
      <AdminDirectoryContent />
    </RequirePlatformAdmin>
  );
}
