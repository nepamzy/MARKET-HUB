"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { RfqListEntry } from "@/lib/types";

function RfqsContent() {
  const params = useParams<{ id: string }>();
  const authedFetch = useAuthedFetch();
  const [rfqs, setRfqs] = useState<RfqListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch<{ rfqs: RfqListEntry[] }>(`/organizations/${params.id}/rfqs`);
      setRfqs(res.rfqs);
    } catch {
      setError("Could not load RFQs for this organization.");
    }
  }, [params.id, authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">RFQs</h1>
      <p className="mt-1 text-sm text-text-secondary">Requests for quotation this organization has sent to suppliers.</p>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      {rfqs === null && !error && <p className="mt-6 text-sm text-text-secondary">Loading…</p>}

      {rfqs && rfqs.length === 0 && (
        <div className="mt-6 rounded-control border border-dashed border-border p-8 text-center">
          <p className="text-sm text-text-secondary">
            No RFQs yet.{" "}
            <Link href={`/organizations/${params.id}/requisitions`} className="text-green-dark hover:underline">
              Start from a requisition
            </Link>
            .
          </p>
        </div>
      )}

      {rfqs && rfqs.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Suppliers</th>
                <th className="px-4 py-3 font-medium">Responses</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rfqs.map((rfq) => (
                <tr key={rfq.id} className="hover:bg-background">
                  <td className="px-4 py-3">
                    <Link href={`/rfqs/${rfq.id}`} className="font-medium text-text-primary hover:text-green-dark">
                      {rfq.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{rfq.title}</td>
                  <td className="px-4 py-3 text-text-secondary">{rfq._count.targets}</td>
                  <td className="px-4 py-3 text-text-secondary">{rfq._count.responses}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={rfq.status} />
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

export default function RfqsPage() {
  return (
    <RequireAuth>
      <RfqsContent />
    </RequireAuth>
  );
}
