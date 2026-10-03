"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { FormAlert } from "@/components/FormAlert";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { formatMinorUnits } from "@/lib/money";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { DirectoryListing, ProductUnitValue, RfqView, SupplierResponseItemView } from "@/lib/types";

interface ResponseItemDraft {
  rfqItemId: string;
  itemName: string;
  quantity: number;
  unit: ProductUnitValue;
  unitPriceMinor: string;
  currency: string;
  leadTimeDays: string;
}

function draftsFromRfq(rfq: RfqView, existing?: SupplierResponseItemView[] | null): ResponseItemDraft[] {
  return rfq.items.map((item) => {
    const match = existing?.find((e) => e.rfqItemId === item.id);
    return {
      rfqItemId: item.id,
      itemName: item.itemName,
      quantity: match?.quantity ?? item.quantity,
      unit: match?.unit ?? item.unit,
      unitPriceMinor: match ? String(match.unitPriceMinor / 100) : "",
      currency: match?.currency ?? "NGN",
      leadTimeDays: match?.leadTimeDays != null ? String(match.leadTimeDays) : "",
    };
  });
}

function BuyerView({ rfq, onReload }: { rfq: RfqView; onReload: () => Promise<void> }) {
  const authedFetch = useAuthedFetch();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showAddTarget, setShowAddTarget] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<DirectoryListing[]>([]);
  const [creatingPo, setCreatingPo] = useState(false);
  const [poError, setPoError] = useState<string | null>(null);

  async function createPurchaseOrder() {
    setPoError(null);
    setCreatingPo(true);
    try {
      const po = await authedFetch<{ id: string }>(`/organizations/${rfq.buyerOrganizationId}/rfqs/${rfq.id}/purchase-order`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      router.push(`/purchase-orders/${po.id}`);
    } catch (err) {
      setPoError(err instanceof ApiError ? err.message : "Could not create a purchase order.");
      setCreatingPo(false);
    }
  }

  async function issue() {
    setActionError(null);
    setBusy(true);
    try {
      await authedFetch(`/organizations/${rfq.buyerOrganizationId}/rfqs/${rfq.id}/issue`, { method: "POST", body: JSON.stringify({}) });
      await onReload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not issue the RFQ.");
    } finally {
      setBusy(false);
    }
  }

  async function searchSuppliers(e: React.FormEvent) {
    e.preventDefault();
    try {
      const query = new URLSearchParams();
      if (search) query.set("category", search);
      const res = await authedFetch<{ organizations: DirectoryListing[] }>(`/directory?${query.toString()}`);
      setResults(res.organizations);
    } catch {
      setResults([]);
    }
  }

  async function addTarget(supplierOrganizationId: string) {
    setActionError(null);
    try {
      await authedFetch(`/organizations/${rfq.buyerOrganizationId}/rfqs/${rfq.id}/targets`, {
        method: "POST",
        body: JSON.stringify({ supplierOrganizationIds: [supplierOrganizationId] }),
      });
      await onReload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not add that supplier.");
    }
  }

  return (
    <div>
      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}

      {rfq.status === "DRAFT" && (
        <section className="card mt-6">
          <p className="text-sm text-text-secondary">
            This RFQ is still a draft — suppliers cannot see it until it is issued.
          </p>
          <button type="button" disabled={busy} onClick={issue} className="btn-primary mt-3">
            Issue RFQ to suppliers
          </button>
        </section>
      )}

      <section className="card mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Supplier targets</h2>
          <button type="button" onClick={() => setShowAddTarget((v) => !v)} className="btn-secondary">
            {showAddTarget ? "Close" : "Add supplier"}
          </button>
        </div>

        {showAddTarget && (
          <div className="mt-4">
            <form onSubmit={searchSuppliers} className="flex gap-2">
              <input
                className="field-input flex-1"
                placeholder="Search the directory by category"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button type="submit" className="btn-secondary">
                Search
              </button>
            </form>
            <div className="mt-2 space-y-1">
              {results.map((org) => (
                <div key={org.id} className="flex items-center justify-between rounded-control border border-border p-2 text-sm">
                  <span>{org.legalName}</span>
                  <button type="button" onClick={() => addTarget(org.id)} className="btn-tertiary text-green-dark">
                    Invite
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-2 font-medium">Supplier</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Invited</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rfq.targets?.map((target) => (
                <tr key={target.id}>
                  <td className="py-2">{target.supplierOrganization?.legalName ?? target.supplierOrganizationId}</td>
                  <td className="py-2">
                    <StatusBadge status={target.status} />
                  </td>
                  <td className="py-2 text-text-secondary">{new Date(target.invitedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {rfq.award && (
        <section className="card mt-6 border-success/30 bg-success/5">
          <h2 className="text-sm font-semibold text-success">Awarded</h2>
          <p className="mt-1 text-sm text-text-primary">
            This RFQ was awarded to {rfq.award.supplierOrganization.legalName}.
          </p>
          {rfq.award.reason && <p className="mt-1 text-sm text-text-secondary">Reason: {rfq.award.reason}</p>}

          {poError && (
            <div className="mt-3">
              <FormAlert>{poError}</FormAlert>
            </div>
          )}

          <div className="mt-3">
            {rfq.purchaseOrder ? (
              <Link href={`/purchase-orders/${rfq.purchaseOrder.id}`} className="btn-primary">
                View purchase order
              </Link>
            ) : (
              <button type="button" disabled={creatingPo} onClick={createPurchaseOrder} className="btn-primary">
                {creatingPo ? "Creating…" : "Create purchase order"}
              </button>
            )}
          </div>
        </section>
      )}

      <section className="card mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Supplier responses</h2>
          {rfq.responses && rfq.responses.length > 0 && (
            <Link href={`/organizations/${rfq.buyerOrganizationId}/rfqs/${rfq.id}/comparison`} className="btn-secondary">
              Compare responses
            </Link>
          )}
        </div>
        {(!rfq.responses || rfq.responses.length === 0) && (
          <p className="mt-2 text-sm text-text-secondary">No responses submitted yet.</p>
        )}
        <div className="mt-4 space-y-4">
          {rfq.responses?.map((response) => (
            <div key={response.id} className="rounded-control border border-border p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-text-primary">{response.supplierOrganization?.legalName ?? response.supplierOrganizationId}</p>
                <StatusBadge status={response.status} />
              </div>
              {response.notes && <p className="mt-1 text-sm text-text-secondary">{response.notes}</p>}
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-secondary">
                    <th className="py-1 font-medium">Item</th>
                    <th className="py-1 font-medium">Qty</th>
                    <th className="py-1 font-medium">Unit price</th>
                    <th className="py-1 font-medium">Lead time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {response.items.map((item) => {
                    const requested = rfq.items.find((i) => i.id === item.rfqItemId);
                    return (
                      <tr key={item.id}>
                        <td className="py-1">{requested?.itemName ?? item.rfqItemId}</td>
                        <td className="py-1">
                          {item.quantity} {item.unit.toLowerCase()}
                        </td>
                        <td className="py-1">{formatMinorUnits(item.unitPriceMinor, item.currency)}</td>
                        <td className="py-1 text-text-secondary">{item.leadTimeDays != null ? `${item.leadTimeDays} days` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SupplierView({ rfq, onReload }: { rfq: RfqView; onReload: () => Promise<void> }) {
  const authedFetch = useAuthedFetch();
  const [items, setItems] = useState<ResponseItemDraft[]>(() => draftsFromRfq(rfq, rfq.response?.items));
  const [notes, setNotes] = useState(rfq.response?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const organizationId = rfq.viewerSupplierOrganizationId!;
  const hasResponse = Boolean(rfq.response);
  const isDraft = rfq.response?.status === "DRAFT";
  const isEditable = !hasResponse || isDraft;

  function updateItem(rfqItemId: string, patch: Partial<ResponseItemDraft>) {
    setItems((prev) => prev.map((item) => (item.rfqItemId === rfqItemId ? { ...item, ...patch } : item)));
  }

  function buildPayload() {
    return {
      notes: notes || undefined,
      items: items
        .filter((item) => item.unitPriceMinor !== "")
        .map((item) => ({
          rfqItemId: item.rfqItemId,
          quantity: Number(item.quantity),
          unit: item.unit,
          unitPriceMinor: Math.round(Number(item.unitPriceMinor) * 100),
          currency: item.currency,
          leadTimeDays: item.leadTimeDays ? Number(item.leadTimeDays) : undefined,
        })),
    };
  }

  async function saveDraft() {
    setActionError(null);
    setBusy(true);
    try {
      const payload = buildPayload();
      if (hasResponse) {
        await authedFetch(`/organizations/${organizationId}/rfqs/${rfq.id}/response`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await authedFetch(`/organizations/${organizationId}/rfqs/${rfq.id}/response`, { method: "POST", body: JSON.stringify(payload) });
      }
      await onReload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not save the response.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setActionError(null);
    setBusy(true);
    try {
      await authedFetch(`/organizations/${organizationId}/rfqs/${rfq.id}/response/submit`, { method: "POST", body: JSON.stringify({}) });
      await onReload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not submit the response.");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setActionError(null);
    setBusy(true);
    try {
      await authedFetch(`/organizations/${organizationId}/rfqs/${rfq.id}/response/withdraw`, { method: "POST", body: JSON.stringify({}) });
      await onReload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not withdraw the response.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {rfq.youWereAwarded != null && (
        <section className={`card mt-6 ${rfq.youWereAwarded ? "border-success/30 bg-success/5" : ""}`}>
          <h2 className={`text-sm font-semibold ${rfq.youWereAwarded ? "text-success" : "text-text-primary"}`}>
            {rfq.youWereAwarded ? "You were awarded this RFQ" : "This RFQ has been awarded"}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {rfq.youWereAwarded
              ? "The buyer selected your response."
              : "The buyer selected another supplier's response for this RFQ."}
          </p>
          {rfq.youWereAwarded && rfq.purchaseOrder && (
            <Link href={`/purchase-orders/${rfq.purchaseOrder.id}`} className="btn-primary mt-3 inline-flex">
              View purchase order
            </Link>
          )}
        </section>
      )}

      {rfq.negotiation && (
        <section className="card mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Negotiation</h2>
            <StatusBadge status={rfq.negotiation.status} />
          </div>
          <Link href={`/negotiations/${rfq.negotiation.id}`} className="btn-secondary mt-3 inline-flex">
            {rfq.negotiation.status === "OPEN" ? "View and respond" : "View negotiation"}
          </Link>
        </section>
      )}

      <section className="card mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Your response</h2>
          {rfq.response && <StatusBadge status={rfq.response.status} />}
        </div>

        {actionError && (
          <div className="mt-4">
            <FormAlert>{actionError}</FormAlert>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <div key={item.rfqItemId} className="grid grid-cols-1 gap-2 rounded-control border border-border p-3 sm:grid-cols-12">
              <p className="flex items-center text-sm font-medium text-text-primary sm:col-span-3">{item.itemName}</p>
              <input
                type="number"
                min={1}
                disabled={!isEditable}
                className="field-input sm:col-span-2"
                value={item.quantity}
                onChange={(e) => updateItem(item.rfqItemId, { quantity: Number(e.target.value) })}
              />
              <input
                type="number"
                step="0.01"
                min={0}
                disabled={!isEditable}
                placeholder="Unit price"
                className="field-input sm:col-span-2"
                value={item.unitPriceMinor}
                onChange={(e) => updateItem(item.rfqItemId, { unitPriceMinor: e.target.value })}
              />
              <input
                disabled={!isEditable}
                placeholder="NGN"
                className="field-input sm:col-span-2"
                value={item.currency}
                onChange={(e) => updateItem(item.rfqItemId, { currency: e.target.value.toUpperCase() })}
              />
              <input
                type="number"
                min={0}
                disabled={!isEditable}
                placeholder="Lead days"
                className="field-input sm:col-span-3"
                value={item.leadTimeDays}
                onChange={(e) => updateItem(item.rfqItemId, { leadTimeDays: e.target.value })}
              />
            </div>
          ))}
        </div>

        <textarea
          disabled={!isEditable}
          placeholder="Notes to the buyer (optional)"
          className="field-input mt-3"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="mt-4 flex flex-wrap gap-2">
          {isEditable && (
            <button type="button" disabled={busy} onClick={saveDraft} className="btn-secondary">
              {hasResponse ? "Save changes" : "Save draft"}
            </button>
          )}
          {isDraft && (
            <button type="button" disabled={busy} onClick={submit} className="btn-primary">
              Submit response
            </button>
          )}
          {rfq.response?.status === "SUBMITTED" && (
            <button type="button" disabled={busy} onClick={withdraw} className="btn-destructive">
              Withdraw response
            </button>
          )}
          {rfq.response?.status === "WITHDRAWN" && <p className="text-sm text-text-secondary">This response has been withdrawn.</p>}
        </div>
      </section>
    </>
  );
}

function RfqDetailContent() {
  const params = useParams<{ rfqId: string }>();
  const authedFetch = useAuthedFetch();
  const [rfq, setRfq] = useState<RfqView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRfq(await authedFetch<RfqView>(`/rfqs/${params.rfqId}`));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "This RFQ does not exist, or you do not have access to it."
          : "Could not load this RFQ."
      );
    }
  }, [params.rfqId, authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!rfq) return <p className="text-sm text-text-secondary">Loading…</p>;

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy">
          {rfq.reference} — {rfq.title}
        </h1>
        <StatusBadge status={rfq.status} />
      </div>
      {rfq.description && <p className="mt-1 text-sm text-text-secondary">{rfq.description}</p>}
      <p className="mt-1 text-xs text-text-secondary">
        {rfq.viewerRole === "buyer" ? "You are the buyer on this RFQ." : "You are a targeted supplier on this RFQ."}
      </p>

      <section className="card mt-6">
        <h2 className="text-lg font-semibold text-text-primary">Requested items</h2>
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
              {rfq.items.map((item) => (
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

      {rfq.viewerRole === "buyer" ? <BuyerView rfq={rfq} onReload={load} /> : <SupplierView rfq={rfq} onReload={load} />}
    </div>
  );
}

export default function RfqDetailPage() {
  return (
    <RequireAuth>
      <RfqDetailContent />
    </RequireAuth>
  );
}
