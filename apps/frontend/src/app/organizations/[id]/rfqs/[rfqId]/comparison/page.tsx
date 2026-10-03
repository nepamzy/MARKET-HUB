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
import type { RfqComparisonView } from "@/lib/types";

function NegotiateForm({
  organizationId,
  rfqId,
  responseId,
  rfqItemId,
  requestedQuantity,
  onDone,
}: {
  organizationId: string;
  rfqId: string;
  responseId: string;
  rfqItemId: string;
  requestedQuantity: number;
  onDone: () => Promise<void>;
}) {
  const authedFetch = useAuthedFetch();
  const [unitPriceMinor, setUnitPriceMinor] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await authedFetch(`/organizations/${organizationId}/rfqs/${rfqId}/negotiations`, {
        method: "POST",
        body: JSON.stringify({
          responseId,
          message: message || undefined,
          items: [
            {
              rfqItemId,
              quantity: requestedQuantity,
              unit: "PIECE",
              unitPriceMinor: Math.round(Number(unitPriceMinor) * 100),
              currency: "NGN",
            },
          ],
        }),
      });
      await onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open a negotiation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 rounded-control border border-border p-3">
      {error && <FormAlert>{error}</FormAlert>}
      <label className="field-label" htmlFor={`counter-${responseId}`}>
        Your counter-offer (unit price)
      </label>
      <input
        id={`counter-${responseId}`}
        required
        type="number"
        step="0.01"
        min={0}
        className="field-input"
        value={unitPriceMinor}
        onChange={(e) => setUnitPriceMinor(e.target.value)}
      />
      <textarea
        placeholder="Message to the supplier (optional)"
        className="field-input"
        rows={2}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? "Sending…" : "Send counter-offer"}
      </button>
    </form>
  );
}

function ComparisonContent() {
  const params = useParams<{ id: string; rfqId: string }>();
  const router = useRouter();
  const authedFetch = useAuthedFetch();
  const [comparison, setComparison] = useState<RfqComparisonView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [negotiatingResponseId, setNegotiatingResponseId] = useState<string | null>(null);
  const [awardingResponseId, setAwardingResponseId] = useState<string | null>(null);
  const [awardReason, setAwardReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setComparison(await authedFetch<RfqComparisonView>(`/organizations/${params.id}/rfqs/${params.rfqId}/comparison`));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "This RFQ does not exist, or you do not have access to it."
          : "Could not load the comparison for this RFQ."
      );
    }
  }, [params.id, params.rfqId, authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function award(responseId: string) {
    setActionError(null);
    setBusy(true);
    try {
      await authedFetch(`/organizations/${params.id}/rfqs/${params.rfqId}/award`, {
        method: "POST",
        body: JSON.stringify({ responseId, reason: awardReason || undefined }),
      });
      router.push(`/rfqs/${params.rfqId}`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not award this RFQ.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!comparison) return <p className="text-sm text-text-secondary">Loading…</p>;

  const isAwarded = comparison.status === "AWARDED";

  return (
    <div>
      <Link href={`/rfqs/${comparison.id}`} className="text-sm text-text-secondary hover:text-navy">
        ← Back to {comparison.reference}
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy">Compare responses</h1>
        <StatusBadge status={comparison.status} />
      </div>
      <p className="mt-1 text-sm text-text-secondary">
        {comparison.title} — review pricing, items and negotiation state before choosing a supplier. Currencies are shown
        exactly as submitted; nothing here is converted or combined across currencies.
      </p>

      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}

      {comparison.responses.length === 0 ? (
        <div className="mt-6 rounded-control border border-dashed border-border p-8 text-center">
          <p className="text-sm text-text-secondary">No responses to compare yet.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {comparison.responses.map((response) => (
            <section key={response.id} className="card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-text-primary">
                  {response.supplierOrganization?.legalName ?? response.supplierOrganizationId}
                </h2>
                <div className="flex items-center gap-2">
                  {response.negotiation && <StatusBadge status={response.negotiation.status} />}
                  <StatusBadge status={response.status} />
                </div>
              </div>
              {response.notes && <p className="mt-1 text-sm text-text-secondary">{response.notes}</p>}

              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-text-secondary">
                      <th className="py-1 font-medium">Item</th>
                      <th className="py-1 font-medium">Qty</th>
                      <th className="py-1 font-medium">Unit price</th>
                      <th className="py-1 font-medium">Currency</th>
                      <th className="py-1 font-medium">Lead time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {response.items.map((item) => {
                      const requested = comparison.items.find((i) => i.id === item.rfqItemId);
                      return (
                        <tr key={item.id}>
                          <td className="py-1">{requested?.itemName ?? item.rfqItemId}</td>
                          <td className="py-1">
                            {item.quantity} {item.unit.toLowerCase()}
                          </td>
                          <td className="py-1 font-medium text-navy">{formatMinorUnits(item.unitPriceMinor, item.currency)}</td>
                          <td className="py-1 text-text-secondary">{item.currency}</td>
                          <td className="py-1 text-text-secondary">{item.leadTimeDays != null ? `${item.leadTimeDays} days` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {!isAwarded && response.status === "SUBMITTED" && (
                <div className="mt-4 flex flex-wrap items-start gap-2">
                  {response.negotiation ? (
                    <Link href={`/negotiations/${response.negotiation.id}`} className="btn-secondary">
                      View negotiation
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setNegotiatingResponseId((v) => (v === response.id ? null : response.id))}
                      className="btn-secondary"
                    >
                      {negotiatingResponseId === response.id ? "Cancel" : "Negotiate"}
                    </button>
                  )}

                  {!response.negotiation || response.negotiation.status !== "OPEN" ? (
                    awardingResponseId === response.id ? (
                      <div className="flex flex-1 flex-wrap items-center gap-2">
                        <input
                          placeholder="Reason (optional)"
                          className="field-input flex-1"
                          value={awardReason}
                          onChange={(e) => setAwardReason(e.target.value)}
                        />
                        <button type="button" disabled={busy} onClick={() => award(response.id)} className="btn-primary">
                          Confirm award
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setAwardingResponseId(response.id)} className="btn-primary">
                        Award
                      </button>
                    )
                  ) : null}
                </div>
              )}

              {negotiatingResponseId === response.id && comparison.items[0] && (
                <NegotiateForm
                  organizationId={params.id}
                  rfqId={comparison.id}
                  responseId={response.id}
                  rfqItemId={comparison.items[0].id}
                  requestedQuantity={response.items[0]?.quantity ?? comparison.items[0].quantity}
                  onDone={async () => {
                    setNegotiatingResponseId(null);
                    await load();
                  }}
                />
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ComparisonPage() {
  return (
    <RequireAuth>
      <ComparisonContent />
    </RequireAuth>
  );
}
