"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RequirePlatformAdmin } from "@/components/RequirePlatformAdmin";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { KycSubmissionSummary } from "@/lib/types";

function AdminKycContent() {
  const authedFetch = useAuthedFetch();
  const [submissions, setSubmissions] = useState<KycSubmissionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSubmissions(await authedFetch<KycSubmissionSummary[]>("/admin/kyc?status=SUBMITTED"));
    } catch {
      setError("Could not load KYC submissions.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">KYC review</h1>
      <p className="mt-1 text-sm text-text-secondary">Businesses awaiting verification review.</p>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      {submissions === null && !error && <p className="mt-6 text-sm text-text-secondary">Loading…</p>}

      {submissions && submissions.length === 0 && (
        <p className="mt-6 text-sm text-text-secondary">No submissions currently awaiting review.</p>
      )}

      {submissions && submissions.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="px-4 py-3 font-medium">Business</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {submissions.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-medium text-text-primary">{s.organization.legalName}</td>
                  <td className="px-4 py-3 text-text-secondary">{s.organization.businessType.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/kyc/${s.id}`} className="btn-tertiary px-0 text-sm">
                      Review
                    </Link>
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

export default function AdminKycPage() {
  return (
    <RequirePlatformAdmin>
      <AdminKycContent />
    </RequirePlatformAdmin>
  );
}
