"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FormAlert } from "@/components/FormAlert";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { FulfillmentStatusValue, FulfillmentView } from "@/lib/types";

const STAGES: { status: FulfillmentStatusValue; label: string }[] = [
  { status: "READY", label: "Ready" },
  { status: "PROCESSING", label: "Processing" },
  { status: "PACKED", label: "Packed" },
  { status: "DISPATCHED", label: "Dispatched" },
];

function Timeline({ fulfillment }: { fulfillment: FulfillmentView }) {
  if (fulfillment.status === "EXCEPTION") {
    return (
      <div>
        <StatusBadge status="EXCEPTION" />
        <p className="mt-2 text-sm text-danger">{fulfillment.exceptionReason}</p>
      </div>
    );
  }

  const stageIndex = STAGES.findIndex((s) => s.status === fulfillment.status);
  const timestamps: Partial<Record<FulfillmentStatusValue, string | null>> = {
    READY: fulfillment.createdAt,
    PACKED: fulfillment.packedAt,
    DISPATCHED: fulfillment.dispatchedAt,
  };

  return (
    <ol>
      {STAGES.map((stage, i) => {
        const isLast = i === STAGES.length - 1;
        const state = i < stageIndex || (i === stageIndex && isLast) ? "complete" : i === stageIndex ? "current" : "upcoming";
        const ts = timestamps[stage.status];
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
              {ts && <p className="text-xs text-text-secondary">{new Date(ts).toLocaleString()}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const EMPTY_DISPATCH_FORM = {
  recipientName: "",
  recipientPhone: "",
  destinationAddressLine: "",
  destinationCity: "",
  destinationState: "",
  destinationCountry: "",
};

function FulfillmentDetailContent() {
  const params = useParams<{ id: string }>();
  const authedFetch = useAuthedFetch();
  const [fulfillment, setFulfillment] = useState<FulfillmentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<"start-processing" | "pack" | null>(null);
  const [showDispatchForm, setShowDispatchForm] = useState(false);
  const [showExceptionForm, setShowExceptionForm] = useState(false);
  const [dispatchForm, setDispatchForm] = useState(EMPTY_DISPATCH_FORM);
  const [exceptionReason, setExceptionReason] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await authedFetch<{ fulfillment: FulfillmentView }>(`/fulfillments/${params.id}`);
      setFulfillment(res.fulfillment);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "This fulfillment does not exist, or you do not have access to it."
          : "Could not load this fulfillment."
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(action: "start-processing" | "pack") {
    setActionError(null);
    setBusy(true);
    try {
      const res = await authedFetch<{ fulfillment: FulfillmentView }>(`/fulfillments/${params.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setFulfillment(res.fulfillment);
      setConfirming(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitDispatch(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setBusy(true);
    try {
      const res = await authedFetch<{ fulfillment: FulfillmentView }>(`/fulfillments/${params.id}/dispatch`, {
        method: "POST",
        body: JSON.stringify({ ...dispatchForm, destinationState: dispatchForm.destinationState || undefined }),
      });
      setFulfillment(res.fulfillment);
      setShowDispatchForm(false);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not dispatch this fulfillment.");
    } finally {
      setBusy(false);
    }
  }

  async function submitException(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setBusy(true);
    try {
      const res = await authedFetch<{ fulfillment: FulfillmentView }>(`/fulfillments/${params.id}/exception`, {
        method: "POST",
        body: JSON.stringify({ reason: exceptionReason }),
      });
      setFulfillment(res.fulfillment);
      setShowExceptionForm(false);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not record this exception.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!fulfillment) return <p className="text-sm text-text-secondary">Loading…</p>;

  const canManage = fulfillment.viewerRole === "seller";
  const canAct = canManage && fulfillment.status !== "DISPATCHED" && fulfillment.status !== "EXCEPTION";

  return (
    <div className="max-w-4xl">
      <Link href={`/orders/${fulfillment.orderId}`} className="text-sm text-text-secondary hover:text-navy">
        ← Back to order
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy">Fulfillment</h1>
        <StatusBadge status={fulfillment.status} />
      </div>
      <p className="mt-1 text-sm text-text-secondary">{fulfillment.sellerOrganization.legalName}</p>

      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card">
            <h2 className="text-lg font-semibold text-text-primary">Items</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-secondary">
                    <th className="py-2 font-medium">Product</th>
                    <th className="py-2 font-medium text-right">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {fulfillment.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2">{item.productName}</td>
                      <td className="py-2 text-right">{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {canAct && (
            <section className="card">
              <h2 className="text-sm font-semibold text-text-primary">Actions</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {fulfillment.status === "READY" && (
                  <button type="button" className="btn-primary" onClick={() => setConfirming("start-processing")}>
                    Start processing
                  </button>
                )}
                {fulfillment.status === "PROCESSING" && (
                  <button type="button" className="btn-primary" onClick={() => setConfirming("pack")}>
                    Mark packed
                  </button>
                )}
                {fulfillment.status === "PACKED" && (
                  <button type="button" className="btn-primary" onClick={() => setShowDispatchForm(true)}>
                    Dispatch
                  </button>
                )}
                <button type="button" className="btn-destructive" onClick={() => setShowExceptionForm(true)}>
                  Report exception
                </button>
              </div>
            </section>
          )}

          {showDispatchForm && (
            <section className="card">
              <h2 className="text-sm font-semibold text-text-primary">Dispatch — delivery destination</h2>
              <p className="mt-1 text-xs text-text-secondary">
                This order has no shipping address on file yet, so enter where this package is going.
              </p>
              <form onSubmit={submitDispatch} className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-wide text-text-secondary">Recipient name</label>
                  <input required className="field-input mt-1" value={dispatchForm.recipientName} onChange={(e) => setDispatchForm((f) => ({ ...f, recipientName: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-text-secondary">Recipient phone</label>
                  <input required className="field-input mt-1" value={dispatchForm.recipientPhone} onChange={(e) => setDispatchForm((f) => ({ ...f, recipientPhone: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs uppercase tracking-wide text-text-secondary">Address</label>
                  <input required className="field-input mt-1" value={dispatchForm.destinationAddressLine} onChange={(e) => setDispatchForm((f) => ({ ...f, destinationAddressLine: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-text-secondary">City</label>
                  <input required className="field-input mt-1" value={dispatchForm.destinationCity} onChange={(e) => setDispatchForm((f) => ({ ...f, destinationCity: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-text-secondary">State / region</label>
                  <input className="field-input mt-1" value={dispatchForm.destinationState} onChange={(e) => setDispatchForm((f) => ({ ...f, destinationState: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-text-secondary">Country</label>
                  <input required className="field-input mt-1" value={dispatchForm.destinationCountry} onChange={(e) => setDispatchForm((f) => ({ ...f, destinationCountry: e.target.value }))} />
                </div>
                <div className="sm:col-span-2 flex gap-2">
                  <button type="submit" disabled={busy} className="btn-primary">
                    {busy ? "Dispatching…" : "Confirm dispatch"}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setShowDispatchForm(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          )}

          {showExceptionForm && (
            <section className="card">
              <h2 className="text-sm font-semibold text-text-primary">Report an exception</h2>
              <form onSubmit={submitException} className="mt-3 space-y-3">
                <textarea
                  required
                  rows={3}
                  className="field-input w-full"
                  placeholder="What went wrong?"
                  value={exceptionReason}
                  onChange={(e) => setExceptionReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <button type="submit" disabled={busy} className="btn-destructive">
                    {busy ? "Saving…" : "Record exception"}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setShowExceptionForm(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          )}

          {fulfillment.delivery && (
            <section className="card">
              <h2 className="text-sm font-semibold text-text-primary">Delivery</h2>
              <div className="mt-3 flex items-center gap-3">
                <StatusBadge status={fulfillment.delivery.status} />
                <Link href={`/deliveries/${fulfillment.delivery.id}`} className="btn-secondary">
                  Track delivery
                </Link>
              </div>
            </section>
          )}
        </div>

        <section className="card h-fit">
          <h2 className="text-sm font-semibold text-text-primary">Status</h2>
          <div className="mt-4">
            <Timeline fulfillment={fulfillment} />
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={confirming !== null}
        title={confirming === "start-processing" ? "Start processing this fulfillment?" : "Mark this fulfillment packed?"}
        confirmLabel={confirming === "start-processing" ? "Start processing" : "Mark packed"}
        busy={busy}
        onConfirm={() => confirming && runAction(confirming)}
        onCancel={() => setConfirming(null)}
      >
        <p>
          {confirming === "start-processing"
            ? "The warehouse team will begin preparing this order's items."
            : "Confirms the items are packed and ready to hand off for dispatch."}
        </p>
      </ConfirmDialog>
    </div>
  );
}

export default function FulfillmentDetailPage() {
  return (
    <RequireAuth>
      <FulfillmentDetailContent />
    </RequireAuth>
  );
}
