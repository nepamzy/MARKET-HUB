"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatMinorUnits } from "@/lib/money";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { PurchaseOrderListEntry, PurchaseOrderStatusValue } from "@/lib/types";

const PAGE_SIZE = 20;
const STATUS_OPTIONS: PurchaseOrderStatusValue[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "CONFIRMED"];

interface ListResponse {
  purchaseOrders: PurchaseOrderListEntry[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Shared by the buyer-side and supplier-side PO lists. `side` only changes
 * the endpoint, the counterparty column and the copy; the data and the
 * authorization both come from the backend.
 */
export function PurchaseOrderList({ side }: { side: "buyer" | "supplier" }) {
  const params = useParams<{ id: string }>();
  const authedFetch = useAuthedFetch();
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PurchaseOrderStatusValue | "">("");
  const [page, setPage] = useState(1);

  const isBuyer = side === "buyer";
  const endpoint = isBuyer ? "purchase-orders" : "supplier-purchase-orders";

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (status) qs.set("status", status);
      setData(await authedFetch<ListResponse>(`/organizations/${params.id}/${endpoint}?${qs}`));
    } catch {
      setError("Could not load purchase orders for this organization.");
    }
  }, [params.id, endpoint, page, status, authedFetch]);

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
          <h1 className="text-2xl font-semibold text-navy">{isBuyer ? "Purchase orders" : "Purchase orders received"}</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {isBuyer
              ? "Purchase orders your organization has issued to suppliers after awarding an RFQ."
              : "Purchase orders buyers have issued to your organization."}
          </p>
        </div>
        <div>
          <label htmlFor="po-status" className="sr-only">
            Filter by status
          </label>
          <select
            id="po-status"
            className="field-input"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value as PurchaseOrderStatusValue | "");
            }}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
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
      {!data && !error && <p className="mt-6 text-sm text-text-secondary">Loading purchase orders…</p>}

      {data && data.purchaseOrders.length === 0 && (
        <div className="mt-6 rounded-control border border-dashed border-border p-8 text-center">
          <p className="text-sm text-text-secondary">
            {status
              ? "No purchase orders match this status."
              : isBuyer
                ? "No purchase orders yet. Award an RFQ, then create a purchase order from the award."
                : "No purchase orders received yet."}
          </p>
        </div>
      )}

      {data && data.purchaseOrders.length > 0 && (
        <>
          {/* relative: contains the sr-only header so it cannot widen the page */}
          <div className="relative mt-6 overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-text-secondary">
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">{isBuyer ? "Supplier" : "Buyer"}</th>
                  <th className="px-4 py-3 font-medium">RFQ</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Currency</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  {isBuyer && <th className="px-4 py-3 font-medium">Updated</th>}
                  <th className="px-4 py-3 font-medium">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.purchaseOrders.map((po) => {
                  const action = nextAction(po.status, side);
                  return (
                    <tr key={po.id} className="hover:bg-background">
                      <td className="px-4 py-3">
                        <Link href={`/purchase-orders/${po.id}`} className="font-medium text-text-primary hover:text-green-dark">
                          {po.reference}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {isBuyer ? po.supplierOrganizationName : po.buyerOrganizationName}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/rfqs/${po.rfqId}`} className="text-text-secondary hover:text-navy" title={po.rfqTitle}>
                          {po.rfqReference}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={po.status} />
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{po.currency}</td>
                      <td className="px-4 py-3 text-right font-medium text-navy">{formatMinorUnits(po.totalMinor, po.currency)}</td>
                      <td className="px-4 py-3 text-text-secondary">{new Date(po.createdAt).toLocaleDateString()}</td>
                      {isBuyer && <td className="px-4 py-3 text-text-secondary">{new Date(po.updatedAt).toLocaleDateString()}</td>}
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/purchase-orders/${po.id}`}
                          className={action ? "font-medium text-green-dark hover:underline" : "text-text-secondary hover:text-navy"}
                        >
                          {action ?? "View"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
            <span>
              {data.total} purchase order{data.total === 1 ? "" : "s"}
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

/** A hint only: the detail page and the backend decide what the viewer can
 * actually do (role within the organization still applies). */
function nextAction(status: PurchaseOrderStatusValue, side: "buyer" | "supplier"): string | null {
  if (side === "buyer") {
    if (status === "DRAFT") return "Submit";
    if (status === "PENDING_APPROVAL") return "Review";
  } else if (status === "APPROVED") {
    return "Confirm";
  }
  return null;
}
