"use client";

import { useCallback, useEffect, useState } from "react";
import { RequirePlatformAdmin } from "@/components/RequirePlatformAdmin";
import { FormAlert } from "@/components/FormAlert";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { Organization } from "@/lib/types";
import type { VerificationStatus } from "@market-hub/shared";
import { VERIFICATION_STATUSES } from "@market-hub/shared";

function AdminContent() {
  const authedFetch = useAuthedFetch();
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch<{ organizations: Organization[] }>("/admin/organizations?pageSize=50");
      setOrganizations(res.organizations);
    } catch {
      setError("Could not load organizations.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleVerificationChange(organizationId: string, status: VerificationStatus) {
    setActionError(null);
    try {
      await authedFetch(`/admin/organizations/${organizationId}/verification`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not update verification status.");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Platform admin</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Foundation-level operator view. Full admin operations are a later phase.
      </p>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}

      {organizations === null && !error && <p className="mt-6 text-sm text-text-secondary">Loading…</p>}

      {organizations && (
        <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="px-4 py-3 font-medium">Organization</th>
                <th className="px-4 py-3 font-medium">Business type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {organizations.map((org) => (
                <tr key={org.id}>
                  <td className="px-4 py-3 font-medium text-text-primary">{org.legalName}</td>
                  <td className="px-4 py-3 text-text-secondary">{org.businessType.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={org.status} />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="field-input py-1.5 text-sm"
                      value={org.verificationStatus}
                      onChange={(e) => handleVerificationChange(org.id, e.target.value as VerificationStatus)}
                    >
                      {VERIFICATION_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <RequirePlatformAdmin>
      <AdminContent />
    </RequirePlatformAdmin>
  );
}
