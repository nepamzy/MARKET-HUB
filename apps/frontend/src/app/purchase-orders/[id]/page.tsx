"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { FormAlert } from "@/components/FormAlert";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { formatMinorUnits } from "@/lib/money";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { PurchaseOrderStatusValue, PurchaseOrderView } from "@/lib/types";

const STAGES: { status: PurchaseOrderStatusValue; label: string }[] = [
  { status: "DRAFT", label: "Draft" },
  { status: "PENDING_APPROVAL", label: "Submitted for approval" },
  { status: "APPROVED", label: "Approved" },
  { status: "CONFIRMED", label: "Confirmed by supplier" },
];

function Timeline({ po }: { po: PurchaseOrderView }) {
  const stageIndex = STAGES.findIndex((s) => s.status === po.status);
  const timestamps: Record<PurchaseOrderStatusValue, string | null> = {
    DRAFT: po.createdAt,
    PENDING_APPROVAL: po.submittedForApprovalAt,
    APPROVED: po.approvedAt,
    CONFIRMED: po.confirmedAt,
  };

  return (
    <ol className="space-y-0">
      {STAGES.map((stage, i) => {
        // CONFIRMED is terminal — once reached, it's complete, not "in
        // progress" waiting on a next stage that doesn't exist.
        const isLastStage = i === STAGES.length - 1;
        const state = i < stageIndex || (i === stageIndex && isLastStage) ? "complete" : i === stageIndex ? "current" : "upcoming";
        const timestamp = timestamps[stage.status];
        return (
          <li key={stage.status} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold ${
                  state === "complete"
                    ? "border-green bg-green text-white"
                    : state === "current"
                      ? "border-navy bg-navy/10 text-navy"
                      : "border-border bg-background text-text-secondary"
                }`}
              >
                {state === "complete" ? "✓" : i + 1}
              </span>
              {i < STAGES.length - 1 && <span className={`w-px flex-1 ${state === "complete" ? "bg-green" : "bg-border"}`} />}
            </div>
            <div className="pb-6">
              <p className={`text-sm font-semibold ${state === "upcoming" ? "text-text-secondary" : "text-text-primary"}`}>
                {stage.label}
                {state === "current" && <span className="ml-2 text-xs font-medium text-navy">In progress</span>}
              </p>
              {timestamp && <p className="text-xs text-text-secondary">{new Date(timestamp).toLocaleString()}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function PurchaseOrderDetailContent() {
  const params = useParams<{ id: string }>();
  const authedFetch = useAuthedFetch();
  const [po, setPo] = useState<PurchaseOrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setPo(await authedFetch<PurchaseOrderView>(`/purchase-orders/${params.id}`));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "This purchase order does not exist, or you do not have access to it."
          : "Could not load this purchase order."
      );
    }
  }, [params.id, authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(action: "submit-for-approval" | "approve" | "confirm") {
    setActionError(null);
    setBusy(true);
    try {
      await authedFetch(`/purchase-orders/${params.id}/${action}`, { method: "POST" });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!po) return <p className="text-sm text-text-secondary">Loading…</p>;

  const canSubmit = po.viewerRole === "buyer" && po.status === "DRAFT";
  const canApprove = po.viewerRole === "buyer" && po.status === "PENDING_APPROVAL";
  const canConfirm = po.viewerRole === "supplier" && po.status === "APPROVED";

  return (
    <div className="max-w-4xl">
      <Link href={`/rfqs/${po.rfqId}`} className="text-sm text-text-secondary hover:text-navy">
        ← Back to RFQ
      </Link>

      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <article className="rounded-card border border-border bg-surface lg:col-span-2">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b-4 border-navy p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary">Purchase order</p>
              <p className="text-2xl font-semibold text-navy">{po.reference}</p>
              <p className="text-sm text-text-secondary">From RFQ award</p>
            </div>
            <div className="text-right">
              <StatusBadge status={po.status} />
              <p className="mt-2 text-xs text-text-secondary">Created {new Date(po.createdAt).toLocaleDateString()}</p>
            </div>
          </header>

          <div className="grid gap-4 border-b border-border p-5 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-text-secondary">Buyer</p>
              <p className="font-medium text-text-primary">{po.buyerOrganizationName}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-text-secondary">Supplier</p>
              <p className="font-medium text-text-primary">{po.supplierOrganizationName}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-background text-left text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 font-medium">Qty</th>
                  <th className="px-4 py-2 font-medium text-right">Unit price</th>
                  <th className="px-4 py-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {po.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-2">
                      <p className="font-medium text-text-primary">{item.itemName}</p>
                      {item.specification && <p className="text-xs text-text-secondary">{item.specification}</p>}
                    </td>
                    <td className="px-4 py-2">
                      {item.quantity} {item.unit.toLowerCase()}
                    </td>
                    <td className="px-4 py-2 text-right">{formatMinorUnits(item.unitPriceMinor, item.currency)}</td>
                    <td className="px-4 py-2 text-right font-medium text-navy">
                      {formatMinorUnits(item.lineTotalMinor, item.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 border-t border-border p-5 sm:grid-cols-2">
            <div className="text-sm">
              {po.notes && (
                <>
                  <p className="text-xs uppercase text-text-secondary">Notes</p>
                  <p className="mt-1 text-text-primary">{po.notes}</p>
                </>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs uppercase text-text-secondary">Total ({po.currency})</p>
              <p className="text-xl font-semibold text-navy">{formatMinorUnits(po.totalMinor, po.currency)}</p>
              <p className="text-xs text-text-secondary">{po.totalQuantity} units total</p>
            </div>
          </div>

          {(canSubmit || canApprove || canConfirm) && (
            <div className="flex flex-wrap gap-2 border-t border-border p-5">
              {canSubmit && (
                <button type="button" disabled={busy} onClick={() => runAction("submit-for-approval")} className="btn-primary">
                  Submit for approval
                </button>
              )}
              {canApprove && (
                <button type="button" disabled={busy} onClick={() => runAction("approve")} className="btn-primary">
                  Approve
                </button>
              )}
              {canConfirm && (
                <button type="button" disabled={busy} onClick={() => runAction("confirm")} className="btn-primary">
                  Confirm purchase order
                </button>
              )}
            </div>
          )}
        </article>

        <section className="card">
          <h2 className="text-sm font-semibold text-text-primary">Status</h2>
          <div className="mt-4">
            <Timeline po={po} />
          </div>
        </section>
      </div>
    </div>
  );
}

export default function PurchaseOrderDetailPage() {
  return (
    <RequireAuth>
      <PurchaseOrderDetailContent />
    </RequireAuth>
  );
}
