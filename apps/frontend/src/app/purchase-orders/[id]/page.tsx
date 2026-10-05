"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FormAlert } from "@/components/FormAlert";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { formatMinorUnits } from "@/lib/money";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { PurchaseOrderStatusValue, PurchaseOrderView } from "@/lib/types";

type PoAction = "submit-for-approval" | "approve" | "confirm";

const STAGES: { status: PurchaseOrderStatusValue; label: string; hint: string }[] = [
  { status: "DRAFT", label: "Draft", hint: "Created from the RFQ award" },
  { status: "PENDING_APPROVAL", label: "Pending approval", hint: "Submitted for buyer approval" },
  { status: "APPROVED", label: "Approved", hint: "Awaiting supplier confirmation" },
  { status: "CONFIRMED", label: "Confirmed by supplier", hint: "Purchase order acknowledged" },
];

const ACTION_COPY: Record<PoAction, { button: string; title: string; body: string[]; success: string }> = {
  "submit-for-approval": {
    button: "Submit for approval",
    title: "Submit this purchase order for approval?",
    body: ["The purchase order moves to Pending approval. Items and totals are fixed from the award and cannot be edited."],
    success: "Purchase order submitted for approval.",
  },
  approve: {
    button: "Approve purchase order",
    title: "Approve this purchase order?",
    body: [
      "Approving moves the purchase order to supplier confirmation. The supplier will then be able to confirm it.",
      "Approval does not trigger payment or shipment.",
    ],
    success: "Purchase order approved. It is now waiting for the supplier to confirm.",
  },
  confirm: {
    button: "Confirm purchase order",
    title: "Confirm this purchase order?",
    body: [
      "Confirming acknowledges that your organization has received this purchase order and accepts its items and totals.",
      "Confirmation is not a payment, shipment or delivery. Those are not part of this step.",
    ],
    success: "Purchase order confirmed. The buyer can see that you acknowledged it.",
  },
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function Timeline({ po }: { po: PurchaseOrderView }) {
  const stageIndex = STAGES.findIndex((s) => s.status === po.status);
  // Only timestamps the API actually returns are shown. The Draft stage uses
  // createdAt; there is no timestamp for any stage the PO has not reached.
  const timestamps: Record<PurchaseOrderStatusValue, string | null> = {
    DRAFT: po.createdAt,
    PENDING_APPROVAL: po.submittedForApprovalAt,
    APPROVED: po.approvedAt,
    CONFIRMED: po.confirmedAt,
  };

  return (
    <ol>
      {STAGES.map((stage, i) => {
        // CONFIRMED is terminal: once reached it is complete, not "in
        // progress" waiting on a next stage that does not exist.
        const isLastStage = i === STAGES.length - 1;
        const state = i < stageIndex || (i === stageIndex && isLastStage) ? "complete" : i === stageIndex ? "current" : "upcoming";
        const timestamp = timestamps[stage.status];
        return (
          <li key={stage.status} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3" aria-current={state === "current" ? "step" : undefined}>
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
                {state === "current" && <span className="ml-2 text-xs font-medium text-navy">Current</span>}
                {state === "upcoming" && <span className="ml-2 text-xs font-normal">Not yet</span>}
              </p>
              <p className="text-xs text-text-secondary">{stage.hint}</p>
              {timestamp && state !== "upcoming" && <p className="text-xs text-text-secondary">{formatDateTime(timestamp)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function statusMessage(po: PurchaseOrderView): string {
  const buyer = po.viewerRole === "buyer";
  switch (po.status) {
    case "DRAFT":
      return buyer
        ? "This purchase order was created from your award. Submit it for approval when you are ready."
        : "The buyer is still preparing this purchase order. You will be able to confirm it once it is approved.";
    case "PENDING_APPROVAL":
      return buyer
        ? "Waiting for approval by a manager or owner of your organization."
        : "The buyer is reviewing this purchase order internally. You will be able to confirm it once it is approved.";
    case "APPROVED":
      return buyer
        ? "Approved. Waiting for the supplier to confirm the purchase order."
        : "The buyer approved this purchase order. Confirm it to acknowledge receipt.";
    case "CONFIRMED":
      return "The supplier has confirmed this purchase order. No further actions are available in this phase.";
  }
}

function PurchaseOrderDetailContent() {
  const params = useParams<{ id: string }>();
  const authedFetch = useAuthedFetch();
  const [po, setPo] = useState<PurchaseOrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState<PoAction | null>(null);
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

  async function runAction(action: PoAction) {
    if (busy) return;
    setActionError(null);
    setSuccess(null);
    setBusy(true);
    try {
      await authedFetch(`/purchase-orders/${params.id}/${action}`, { method: "POST" });
      await load();
      setSuccess(ACTION_COPY[action].success);
      setPending(null);
    } catch (err) {
      setPending(null);
      if (err instanceof ApiError && err.status === 404) {
        setActionError("You cannot perform this action. Only managers and owners of the organization can move a purchase order forward.");
      } else if (err instanceof ApiError && err.status === 409) {
        setActionError("This purchase order is no longer in a state where that action applies. It has been refreshed.");
        await load();
      } else {
        setActionError(err instanceof ApiError ? err.message : "That action could not be completed.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="max-w-4xl">
        <FormAlert>{error}</FormAlert>
        <Link href="/organizations" className="mt-4 inline-block text-sm text-text-secondary hover:text-navy">
          ← Back to organizations
        </Link>
      </div>
    );
  }
  if (!po) return <p className="text-sm text-text-secondary">Loading purchase order…</p>;

  const isBuyer = po.viewerRole === "buyer";
  const action: PoAction | null =
    isBuyer && po.status === "DRAFT"
      ? "submit-for-approval"
      : isBuyer && po.status === "PENDING_APPROVAL"
        ? "approve"
        : !isBuyer && po.status === "APPROVED"
          ? "confirm"
          : null;
  const listHref = `/organizations/${isBuyer ? po.buyerOrganizationId : po.supplierOrganizationId}/${
    isBuyer ? "purchase-orders" : "supplier-purchase-orders"
  }`;

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
        <Link href={listHref} className="hover:text-navy">
          ← {isBuyer ? "Purchase orders" : "Purchase orders received"}
        </Link>
        <Link href={`/rfqs/${po.rfqId}`} className="hover:text-navy">
          View RFQ {po.rfqReference}
        </Link>
      </div>

      {success && (
        <div role="status" className="mt-4 rounded-control border border-success/30 bg-success/5 p-3 text-sm text-success">
          {success}
        </div>
      )}
      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <article className="rounded-card border border-border bg-surface">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b-4 border-navy p-5">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary">Purchase order</p>
                <p className="break-words text-2xl font-semibold text-navy">{po.reference}</p>
                <p className="text-sm text-text-secondary">
                  From {po.rfqReference} · {po.rfqTitle}
                </p>
              </div>
              <div className="sm:text-right">
                <StatusBadge status={po.status} />
                <p className="mt-2 text-xs text-text-secondary">Created {new Date(po.createdAt).toLocaleDateString()}</p>
              </div>
            </header>

            <div className="grid gap-4 border-b border-border p-5 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <p className="text-xs uppercase text-text-secondary">Buyer{isBuyer ? " (you)" : ""}</p>
                <p className="break-words font-medium text-text-primary">{po.buyerOrganizationName}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase text-text-secondary">Supplier{!isBuyer ? " (you)" : ""}</p>
                <p className="break-words font-medium text-text-primary">{po.supplierOrganizationName}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-background text-left text-xs uppercase text-text-secondary">
                  <tr>
                    <th className="px-4 py-2 font-medium">Item</th>
                    <th className="px-4 py-2 font-medium">Qty</th>
                    <th className="px-4 py-2 font-medium text-right">Unit price</th>
                    <th className="px-4 py-2 font-medium text-right">Line total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {po.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2">
                        <p className="font-medium text-text-primary">{item.itemName}</p>
                        {item.specification && <p className="text-xs text-text-secondary">{item.specification}</p>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        {item.quantity} {item.unit.toLowerCase()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">{formatMinorUnits(item.unitPriceMinor, item.currency)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right font-medium text-navy">
                        {formatMinorUnits(item.lineTotalMinor, item.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-border p-5 text-sm">
              <dl className="ml-auto max-w-xs space-y-1">
                <div className="flex justify-between gap-4">
                  <dt className="text-text-secondary">Subtotal</dt>
                  <dd className="text-text-primary">{formatMinorUnits(po.subtotalMinor, po.currency)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-border pt-1">
                  <dt className="font-semibold text-text-primary">Total ({po.currency})</dt>
                  <dd className="text-lg font-semibold text-navy">{formatMinorUnits(po.totalMinor, po.currency)}</dd>
                </div>
                <p className="pt-1 text-right text-xs text-text-secondary">{po.totalQuantity} units in total · amounts in {po.currency}, no conversion applied</p>
              </dl>
            </div>
          </article>

          <section className="card">
            <h2 className="text-sm font-semibold text-text-primary">Procurement context</h2>
            <ol className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary" aria-label="Procurement path">
              {["RFQ", "Supplier response", "Negotiation (if any)", "Award", "Purchase order"].map((step, i, all) => (
                <li key={step} className="flex items-center gap-2">
                  <span className={i === all.length - 1 ? "font-semibold text-navy" : ""}>{step}</span>
                  {i < all.length - 1 && <span aria-hidden="true">→</span>}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-sm text-text-secondary">
              Prices and quantities were taken from the awarded supplier response, or from the final accepted negotiation offer where one
              exists.
            </p>
            {po.notes && (
              <div className="mt-3 text-sm">
                <p className="text-xs uppercase text-text-secondary">Notes</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-text-primary">{po.notes}</p>
              </div>
            )}
          </section>
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="card">
            <h2 className="text-sm font-semibold text-text-primary">Lifecycle</h2>
            <div className="mt-4">
              <Timeline po={po} />
            </div>
          </section>

          <section className="card">
            <h2 className="text-sm font-semibold text-text-primary">{action ? "Next step" : "Status"}</h2>
            <p className="mt-2 text-sm text-text-secondary">{statusMessage(po)}</p>
            {action && (
              <button type="button" disabled={busy} onClick={() => setPending(action)} className="btn-primary mt-4 w-full">
                {ACTION_COPY[action].button}
              </button>
            )}
            <p className="mt-3 text-xs text-text-secondary">
              Payment, shipment and delivery are not part of this purchase order yet.
            </p>
          </section>
        </aside>
      </div>

      {pending && (
        <ConfirmDialog
          open
          title={ACTION_COPY[pending].title}
          confirmLabel={ACTION_COPY[pending].button}
          busy={busy}
          onConfirm={() => runAction(pending)}
          onCancel={() => setPending(null)}
        >
          {ACTION_COPY[pending].body.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </ConfirmDialog>
      )}
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
