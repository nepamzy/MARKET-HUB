"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { FulfillmentStatusValue, FulfillmentView } from "@/lib/types";

const PAGE_SIZE = 20;
const STATUS_OPTIONS: FulfillmentStatusValue[] = ["READY", "PROCESSING", "PACKED", "DISPATCHED", "EXCEPTION"];

interface ListResponse {
  fulfillments: FulfillmentView[];
  page: number;
  pageSize: number;
  total: number;
}

function FulfillmentsContent() {
  const params = useParams<{ id: string }>();
  const authedFetch = useAuthedFetch();
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<FulfillmentStatusValue | "">("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (status) qs.set("status", status);
      setData(await authedFetch<ListResponse>(`/organizations/${params.id}/fulfillments?${qs}`));
    } catch {
      setError("Could not load fulfillments for this organization.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, page, status]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <Link href={`/organizations/${params.id}`} className="text-sm text-text-secondary hover:text-navy">
        ← Back to organization
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Fulfillment</h1>
          <p className="mt-1 text-sm text-text-secondary">Orders ready to pack and dispatch.</p>
        </div>
        <div>
          <label htmlFor="fulfillment-status" className="sr-only">
            Filter by status
          </label>
          <select
            id="fulfillment-status"
            className="field-input"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value as FulfillmentStatusValue | "");
            }}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-control border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          {error}{" "}
          <button type="button" className="font-medium underline" onClick={load}>
            Try again
          </button>
        </div>
      )}
      {!data && !error && <p className="mt-6 text-sm text-text-secondary">Loading fulfillments…</p>}

      {data && data.fulfillments.length === 0 && (
        <div className="mt-6 rounded-control border border-dashed border-border p-8 text-center">
          <p className="text-sm text-text-secondary">
            {status ? "No fulfillments match this status." : "No fulfillments yet — start one from a confirmed order."}
          </p>
        </div>
      )}

      {data && data.fulfillments.length > 0 && (
        <>
          <div className="relative mt-6 overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-text-secondary">
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Items</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Delivery</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.fulfillments.map((f) => (
                  <tr key={f.id} className="hover:bg-background">
                    <td className="px-4 py-3">
                      <Link href={`/orders/${f.orderId}`} className="font-medium text-text-primary hover:text-green-dark">
                        Order {f.orderId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {f.items.reduce((sum, i) => sum + i.quantity, 0)} item{f.items.length === 1 ? "" : "s"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={f.status} />
                    </td>
                    <td className="px-4 py-3">{f.delivery ? <StatusBadge status={f.delivery.status} /> : <span className="text-text-secondary">—</span>}</td>
                    <td className="px-4 py-3 text-text-secondary">{new Date(f.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/fulfillments/${f.id}`} className="font-medium text-green-dark hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
            <span>
              {data.total} fulfillment{data.total === 1 ? "" : "s"}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <button type="button" className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  Next
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function OrganizationFulfillmentsPage() {
  return (
    <RequireAuth>
      <FulfillmentsContent />
    </RequireAuth>
  );
}
