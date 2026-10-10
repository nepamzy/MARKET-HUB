"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { FormAlert } from "@/components/FormAlert";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { DirectoryListing, RequisitionStatusValue, RequisitionView } from "@/lib/types";

const STAGES: { status: RequisitionStatusValue; label: string }[] = [
  { status: "DRAFT", label: "Draft" },
  { status: "SUBMITTED", label: "Submitted" },
  { status: "RFQ_CREATED", label: "RFQ created" },
];

/** Terminal stage reached = complete, never "current" — the same fix
 * applied to the Order and Purchase Order timelines: a stage with nothing
 * further waiting on it is done, not perpetually in progress. CANCELLED is
 * reachable from either DRAFT or SUBMITTED, so there is no single fixed
 * point to place it at in a linear sequence — it gets its own banner
 * instead of a misleading stepper position. */
function RequisitionLifecycle({ requisition }: { requisition: RequisitionView }) {
  if (requisition.status === "CANCELLED") {
    return <p className="text-sm text-text-secondary">This requisition was cancelled before an RFQ was created.</p>;
  }

  const stageIndex = STAGES.findIndex((s) => s.status === requisition.status);

  return (
    <ol className="space-y-0">
      {STAGES.map((stage, i) => {
        const isLastStage = i === STAGES.length - 1;
        const state = i < stageIndex || (i === stageIndex && isLastStage) ? "complete" : i === stageIndex ? "current" : "upcoming";
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
              {state !== "upcoming" && stage.status === "DRAFT" && (
                <p className="text-xs text-text-secondary">{new Date(requisition.createdAt).toLocaleString()}</p>
              )}
              {state !== "upcoming" && stage.status === "SUBMITTED" && requisition.submittedAt && (
                <p className="text-xs text-text-secondary">{new Date(requisition.submittedAt).toLocaleString()}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function RequisitionDetailContent() {
  const params = useParams<{ id: string; requisitionId: string }>();
  const router = useRouter();
  const authedFetch = useAuthedFetch();
  const [requisition, setRequisition] = useState<RequisitionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showRfqForm, setShowRfqForm] = useState(false);
  const [rfqTitle, setRfqTitle] = useState("");
  const [rfqDescription, setRfqDescription] = useState("");
  const [rfqDeadline, setRfqDeadline] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierResults, setSupplierResults] = useState<DirectoryListing[]>([]);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);
  const [rfqError, setRfqError] = useState<string | null>(null);
  const [creatingRfq, setCreatingRfq] = useState(false);

  const load = useCallback(async () => {
    try {
      setRequisition(
        await authedFetch<RequisitionView>(`/organizations/${params.id}/requisitions/${params.requisitionId}`)
      );
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "This requisition does not exist, or you do not have access to it."
          : "Could not load this requisition."
      );
    }
  }, [params.id, params.requisitionId, authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function performAction(action: "submit" | "cancel") {
    setActionError(null);
    setBusy(true);
    try {
      setRequisition(
        await authedFetch<RequisitionView>(`/organizations/${params.id}/requisitions/${params.requisitionId}/${action}`, {
          method: "POST",
          body: JSON.stringify({}),
        })
      );
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function searchSuppliers() {
    try {
      const query = new URLSearchParams();
      if (supplierSearch) query.set("category", supplierSearch);
      const res = await authedFetch<{ organizations: DirectoryListing[] }>(`/directory?${query.toString()}`);
      setSupplierResults(res.organizations);
    } catch {
      setSupplierResults([]);
    }
  }

  function toggleSupplier(id: string) {
    setSelectedSupplierIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function handleCreateRfq(e: React.FormEvent) {
    e.preventDefault();
    setRfqError(null);
    setCreatingRfq(true);
    try {
      const rfq = await authedFetch<{ id: string }>(`/organizations/${params.id}/rfqs`, {
        method: "POST",
        body: JSON.stringify({
          requisitionId: params.requisitionId,
          title: rfqTitle,
          description: rfqDescription || undefined,
          responseDeadline: rfqDeadline || undefined,
          supplierOrganizationIds: selectedSupplierIds,
        }),
      });
      router.push(`/rfqs/${rfq.id}`);
    } catch (err) {
      setRfqError(err instanceof ApiError ? err.message : "Could not create the RFQ.");
    } finally {
      setCreatingRfq(false);
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!requisition) return <p className="text-sm text-text-secondary">Loading…</p>;

  const canSubmit = requisition.status === "DRAFT";
  const canCancel = requisition.status === "DRAFT" || requisition.status === "SUBMITTED";
  const canCreateRfq = requisition.status === "SUBMITTED";
  const resultingRfq = requisition.rfqs[0] ?? null;

  return (
    <div className="max-w-5xl">
      <Link href={`/organizations/${params.id}/requisitions`} className="text-sm text-text-secondary hover:text-navy">
        ← Back to requisitions
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy">
          {requisition.reference} — {requisition.title}
        </h1>
        <StatusBadge status={requisition.status} />
      </div>
      <p className="mt-1 text-sm text-text-secondary">
        Requested by {requisition.requestedByUser.name} · created {new Date(requisition.createdAt).toLocaleString()}
      </p>

      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}
      {requisition.status === "CANCELLED" && requisition.cancelReason && (
        <div className="mt-4">
          <FormAlert tone="error">Cancelled: {requisition.cancelReason}</FormAlert>
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
                    <th className="py-2 font-medium">Item</th>
                    <th className="py-2 font-medium">Quantity</th>
                    <th className="py-2 font-medium">Specification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {requisition.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2">{item.itemName}</td>
                      <td className="py-2">
                        {item.quantity} {item.unit.toLowerCase()}
                      </td>
                      <td className="py-2 text-text-secondary">{item.specification ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {(canSubmit || canCancel) && (
            <section className="card">
              <h2 className="text-sm font-semibold text-text-primary">Actions</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {canSubmit && (
                  <button type="button" disabled={busy} onClick={() => performAction("submit")} className="btn-primary">
                    Submit requisition
                  </button>
                )}
                {canCancel && (
                  <button type="button" disabled={busy} onClick={() => performAction("cancel")} className="btn-destructive">
                    Cancel requisition
                  </button>
                )}
              </div>
            </section>
          )}

          {resultingRfq && (
            <section className="card border-success/30 bg-success/5">
              <h2 className="text-sm font-semibold text-success">RFQ created</h2>
              <p className="mt-1 text-sm text-text-primary">
                This requisition became an RFQ. Suppliers, responses, and the RFQ itself are managed from there.
              </p>
              <Link href={`/rfqs/${resultingRfq.id}`} className="btn-primary mt-3 inline-flex">
                View RFQ
              </Link>
            </section>
          )}

          {canCreateRfq && (
            <section className="card">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-primary">Create an RFQ from this requisition</h2>
                <button type="button" onClick={() => setShowRfqForm((v) => !v)} className="btn-secondary">
                  {showRfqForm ? "Cancel" : "Create RFQ"}
                </button>
              </div>

              {showRfqForm && (
                <form onSubmit={handleCreateRfq} className="mt-4 space-y-4">
                  {rfqError && <FormAlert>{rfqError}</FormAlert>}
                  <div>
                    <label htmlFor="rfqTitle" className="field-label">
                      RFQ title
                    </label>
                    <input
                      id="rfqTitle"
                      required
                      className="field-input mt-1"
                      value={rfqTitle}
                      onChange={(e) => setRfqTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="rfqDescription" className="field-label">
                      Description (optional)
                    </label>
                    <textarea
                      id="rfqDescription"
                      className="field-input mt-1"
                      rows={3}
                      value={rfqDescription}
                      onChange={(e) => setRfqDescription(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="rfqDeadline" className="field-label">
                      Response deadline (optional)
                    </label>
                    <input
                      id="rfqDeadline"
                      type="date"
                      min={new Date().toISOString().slice(0, 10)}
                      className="field-input mt-1"
                      value={rfqDeadline}
                      onChange={(e) => setRfqDeadline(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-text-secondary">When suppliers should respond by.</p>
                  </div>

                  <div>
                    <p className="field-label">Invite suppliers</p>
                    {/* A plain button + onClick here, never a nested <form> — an
                        HTML <form> cannot contain another <form>, and this whole
                        section already lives inside the RFQ-creation form. */}
                    <div className="mt-1 flex gap-2">
                      <input
                        className="field-input flex-1"
                        placeholder="Search the directory by category"
                        value={supplierSearch}
                        onChange={(e) => setSupplierSearch(e.target.value)}
                      />
                      <button type="button" onClick={searchSuppliers} className="btn-secondary">
                        Search
                      </button>
                    </div>
                    <div className="mt-2 space-y-1">
                      {supplierResults.map((org) => (
                        <label key={org.id} className="flex items-start gap-2 rounded-control border border-border p-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={selectedSupplierIds.includes(org.id)}
                            onChange={() => toggleSupplier(org.id)}
                          />
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="font-medium text-text-primary">{org.legalName}</span>
                              <StatusBadge status={org.verificationStatus} />
                            </span>
                            <span className="block text-xs text-text-secondary">
                              {org.businessType.replace(/_/g, " ")}
                              {org.city || org.country ? " · " : ""}
                              {org.city ? `${org.city}, ` : ""}
                              {org.country ?? ""}
                            </span>
                            {org.supplierProfile.capabilities.length > 0 && (
                              <span className="block text-xs text-text-secondary">
                                {org.supplierProfile.capabilities.join(", ").replace(/_/g, " ")}
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-control bg-background px-3 py-2 text-xs text-text-secondary">
                    {requisition.items.length} item{requisition.items.length === 1 ? "" : "s"} ·{" "}
                    {selectedSupplierIds.length} supplier{selectedSupplierIds.length === 1 ? "" : "s"} selected
                  </div>

                  <button type="submit" disabled={creatingRfq || selectedSupplierIds.length === 0} className="btn-primary">
                    {creatingRfq ? "Creating…" : "Create RFQ (draft)"}
                  </button>
                </form>
              )}
            </section>
          )}
        </div>

        <section className="card h-fit">
          <h2 className="text-sm font-semibold text-text-primary">Status</h2>
          <div className="mt-4">
            <RequisitionLifecycle requisition={requisition} />
          </div>
        </section>
      </div>
    </div>
  );
}

export default function RequisitionDetailPage() {
  return (
    <RequireAuth>
      <RequisitionDetailContent />
    </RequireAuth>
  );
}
