"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { FormAlert } from "@/components/FormAlert";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { DirectoryListing, RequisitionView } from "@/lib/types";

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

  return (
    <div className="max-w-3xl">
      <Link href={`/organizations/${params.id}/requisitions`} className="text-sm text-text-secondary hover:text-navy">
        ← Back to requisitions
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy">
          {requisition.reference} — {requisition.title}
        </h1>
        <StatusBadge status={requisition.status} />
      </div>
      <p className="mt-1 text-sm text-text-secondary">Created {new Date(requisition.createdAt).toLocaleString()}</p>

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

      <section className="card mt-6">
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
        <section className="card mt-6">
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

      {canCreateRfq && (
        <section className="card mt-6">
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
                <input id="rfqTitle" required className="field-input mt-1" value={rfqTitle} onChange={(e) => setRfqTitle(e.target.value)} />
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
                    <label key={org.id} className="flex items-center gap-2 rounded-control border border-border p-2 text-sm">
                      <input type="checkbox" checked={selectedSupplierIds.includes(org.id)} onChange={() => toggleSupplier(org.id)} />
                      {org.legalName}
                    </label>
                  ))}
                </div>
                {selectedSupplierIds.length > 0 && (
                  <p className="mt-2 text-xs text-text-secondary">{selectedSupplierIds.length} supplier(s) selected</p>
                )}
              </div>

              <button type="submit" disabled={creatingRfq || selectedSupplierIds.length === 0} className="btn-primary">
                {creatingRfq ? "Creating…" : "Create RFQ (draft)"}
              </button>
            </form>
          )}
        </section>
      )}
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
