"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { RfqListEntry, RfqSupplierTargetStatusValue } from "@/lib/types";

interface InboxEntry {
  id: string;
  status: RfqSupplierTargetStatusValue;
  invitedAt: string;
  respondedAt: string | null;
  rfq: RfqListEntry;
}

function RfqInboxContent() {
  const params = useParams<{ id: string }>();
  const authedFetch = useAuthedFetch();
  const [targets, setTargets] = useState<InboxEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch<{ targets: InboxEntry[] }>(`/organizations/${params.id}/rfq-inbox`);
      setTargets(res.targets);
    } catch {
      setError("Could not load the RFQ inbox for this organization.");
    }
  }, [params.id, authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">RFQ inbox</h1>
      <p className="mt-1 text-sm text-text-secondary">Requests for quotation sent to this organization.</p>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      {targets === null && !error && <p className="mt-6 text-sm text-text-secondary">Loading…</p>}

      {targets && targets.length === 0 && (
        <div className="mt-6 rounded-control border border-dashed border-border p-8 text-center">
          <p className="text-sm text-text-secondary">No RFQs have been sent to this organization yet.</p>
        </div>
      )}

      {targets && targets.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Invited</th>
                <th className="px-4 py-3 font-medium">Deadline</th>
                <th className="px-4 py-3 font-medium">Your status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {targets.map((target) => (
                <tr key={target.id} className="hover:bg-background">
                  <td className="px-4 py-3">
                    <Link href={`/rfqs/${target.rfq.id}`} className="font-medium text-text-primary hover:text-green-dark">
                      {target.rfq.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{target.rfq.title}</td>
                  <td className="px-4 py-3 text-text-secondary">{new Date(target.invitedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {target.rfq.responseDeadline ? new Date(target.rfq.responseDeadline).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={target.status} />
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

export default function RfqInboxPage() {
  return (
    <RequireAuth>
      <RfqInboxContent />
    </RequireAuth>
  );
}
