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
import type { ComparisonResponseView, RfqComparisonView, RfqItemView } from "@/lib/types";

function sumByCurrency(rows: { quantity: number; unitPriceMinor: number; currency: string }[]): string | null {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.quantity * row.unitPriceMinor);
  }
  if (totals.size === 0) return null;
  return Array.from(totals.entries())
    .map(([currency, minor]) => formatMinorUnits(minor, currency))
    .join(" + ");
}

/**
 * Reused, scoped to this one open form — opening a negotiation (Phase 8 §3)
 * must carry the item's real unit and the response's real currency/price,
 * never a hardcoded guess. Pre-fills from the response's own submitted
 * values for that item so the buyer edits a real starting point instead of
 * typing a price into a silently-wrong currency/unit.
 */
function NegotiateForm({
  organizationId,
  rfqId,
  response,
  items,
  onDone,
}: {
  organizationId: string;
  rfqId: string;
  response: ComparisonResponseView;
  items: RfqItemView[];
  onDone: () => Promise<void>;
}) {
  const authedFetch = useAuthedFetch();
  const [drafts, setDrafts] = useState(() =>
    response.items.map((item) => ({
      rfqItemId: item.rfqItemId,
      quantity: item.quantity,
      unit: item.unit,
      currency: item.currency,
      unitPriceMinor: String(item.unitPriceMinor / 100),
    }))
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update(rfqItemId: string, price: string) {
    setDrafts((prev) => prev.map((d) => (d.rfqItemId === rfqItemId ? { ...d, unitPriceMinor: price } : d)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await authedFetch(`/organizations/${organizationId}/rfqs/${rfqId}/negotiations`, {
        method: "POST",
        body: JSON.stringify({
          responseId: response.id,
          message: message || undefined,
          items: drafts.map((d) => ({
            rfqItemId: d.rfqItemId,
            quantity: d.quantity,
            unit: d.unit,
            unitPriceMinor: Math.round(Number(d.unitPriceMinor) * 100),
            currency: d.currency,
          })),
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
    <form onSubmit={submit} className="mt-3 space-y-2 rounded-control border border-border p-3 text-left">
      {error && <FormAlert>{error}</FormAlert>}
      <p className="text-xs font-medium text-text-secondary">Your opening counter-offer</p>
      {drafts.map((d) => {
        const requested = items.find((i) => i.id === d.rfqItemId);
        return (
          <div key={d.rfqItemId} className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm">
            <label htmlFor={`counter-${response.id}-${d.rfqItemId}`} className="text-text-secondary">
              {requested?.itemName ?? d.rfqItemId} ({d.quantity} {d.unit.toLowerCase()})
            </label>
            <div className="flex items-center gap-1">
              <span className="text-xs text-text-secondary">{d.currency}</span>
              <input
                id={`counter-${response.id}-${d.rfqItemId}`}
                required
                type="number"
                step="0.01"
                min={0}
                className="field-input w-28"
                value={d.unitPriceMinor}
                onChange={(e) => update(d.rfqItemId, e.target.value)}
              />
            </div>
          </div>
        );
      })}
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

function AwardConfirm({
  organizationId,
  rfqId,
  response,
  items,
  onDone,
}: {
  organizationId: string;
  rfqId: string;
  response: ComparisonResponseView;
  items: RfqItemView[];
  onDone: () => Promise<void>;
}) {
  const authedFetch = useAuthedFetch();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // An ACCEPTED negotiation supersedes the response's originally submitted
  // prices — awarding should reflect what both sides actually agreed to,
  // not the stale as-submitted figures (SupplierResponse.items is never
  // rewritten when a negotiation concludes). Loaded lazily since most
  // awards have no negotiation at all.
  const [negotiatedItems, setNegotiatedItems] = useState<{ rfqItemId: string; quantity: number; unitPriceMinor: number; currency: string }[] | null>(
    null
  );

  useEffect(() => {
    if (response.negotiation?.status !== "ACCEPTED") return;
    authedFetch<{ events: { items: { rfqItemId: string; quantity: number; unitPriceMinor: number; currency: string }[] }[] }>(
      `/negotiations/${response.negotiation.id}`
    )
      .then((negotiation) => {
        const lastEvent = negotiation.events[negotiation.events.length - 1];
        if (lastEvent) setNegotiatedItems(lastEvent.items);
      })
      .catch(() => {
        // Non-fatal: falls back to showing the as-submitted figures below.
      });
  }, [response.negotiation, authedFetch]);

  async function confirm() {
    setError(null);
    setBusy(true);
    try {
      await authedFetch(`/organizations/${organizationId}/rfqs/${rfqId}/award`, {
        method: "POST",
        body: JSON.stringify({ responseId: response.id, reason: reason || undefined }),
      });
      await onDone();
      router.push(`/rfqs/${rfqId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not award this RFQ.");
      setBusy(false);
    }
  }

  const usingNegotiatedTerms = response.negotiation?.status === "ACCEPTED" && negotiatedItems != null;
  const total = usingNegotiatedTerms ? sumByCurrency(negotiatedItems!) : sumByCurrency(response.items);

  return (
    <div className="mt-3 rounded-control border border-navy/30 bg-navy/5 p-3 text-left">
      {error && <FormAlert>{error}</FormAlert>}
      <p className="text-sm font-semibold text-navy">Confirm award</p>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-text-secondary">Supplier</dt>
          <dd className="font-medium text-text-primary">{response.supplierOrganization?.legalName ?? response.supplierOrganizationId}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-text-secondary">Items</dt>
          <dd className="text-text-primary">{response.items.length} of {items.length} quoted</dd>
        </div>
        {total && (
          <div className="flex justify-between gap-2">
            <dt className="text-text-secondary">{usingNegotiatedTerms ? "Negotiated total" : "Total"}</dt>
            <dd className="font-medium text-text-primary">{total}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-text-secondary">Negotiation</dt>
          <dd className="text-text-primary">{response.negotiation ? response.negotiation.status.toLowerCase() : "none opened"}</dd>
        </div>
      </dl>
      {response.negotiation?.status === "ACCEPTED" && (
        <p className="mt-1 text-xs text-text-secondary">
          {usingNegotiatedTerms
            ? "Reflects the accepted negotiated terms, not the originally submitted prices."
            : "This response has an accepted negotiation — loading the agreed terms…"}
        </p>
      )}
      <p className="mt-2 text-xs text-text-secondary">
        This cannot be undone. The RFQ will move to AWARDED and no further negotiation or award is possible.
      </p>
      <input
        placeholder="Reason (optional)"
        className="field-input mt-2"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <button type="button" disabled={busy} onClick={confirm} className="btn-primary mt-2 w-full">
        {busy ? "Awarding…" : "Confirm award to this supplier"}
      </button>
    </div>
  );
}

function ComparisonContent() {
  const params = useParams<{ id: string; rfqId: string }>();
  const authedFetch = useAuthedFetch();
  const [comparison, setComparison] = useState<RfqComparisonView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [negotiatingResponseId, setNegotiatingResponseId] = useState<string | null>(null);
  const [awardingResponseId, setAwardingResponseId] = useState<string | null>(null);

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
        exactly as submitted; nothing here is converted, combined, or ranked for you.
      </p>

      {isAwarded && comparison.award && (
        <div className="mt-6 rounded-card border border-success/30 bg-success/5 p-4">
          <h2 className="text-sm font-semibold text-success">Awarded</h2>
          <p className="mt-1 text-sm text-text-primary">
            This RFQ was awarded to <strong>{comparison.award.supplierOrganization.legalName}</strong>
            {comparison.award.reason && <> — {comparison.award.reason}</>}.
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            Decided {new Date(comparison.award.createdAt).toLocaleString()}. This procurement milestone is complete.
          </p>
        </div>
      )}

      {comparison.responses.length === 0 ? (
        <div className="mt-6 rounded-control border border-dashed border-border p-8 text-center">
          <p className="text-sm text-text-secondary">No responses to compare yet.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full text-sm" style={{ minWidth: `${160 + comparison.responses.length * 220}px` }}>
            <thead>
              <tr className="border-b border-border bg-background text-left text-text-secondary">
                <th className="sticky left-0 bg-background px-4 py-3 font-medium">Criteria</th>
                {comparison.responses.map((response) => {
                  const won = isAwarded && comparison.award?.responseId === response.id;
                  return (
                    <th key={response.id} className="px-4 py-3 align-top font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold normal-case text-text-primary">
                          {response.supplierOrganization?.legalName ?? response.supplierOrganizationId}
                        </span>
                        {won && <span className="badge bg-success/10 text-success">Awarded</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <StatusBadge status={response.status} />
                        {response.negotiation && <StatusBadge status={response.negotiation.status} />}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <th scope="row" className="sticky left-0 bg-surface px-4 py-2 text-left font-medium text-text-secondary">
                  Submitted
                </th>
                {comparison.responses.map((response) => (
                  <td key={response.id} className="px-4 py-2 text-text-secondary">
                    {response.submittedAt ? new Date(response.submittedAt).toLocaleString() : "—"}
                    {response.status === "WITHDRAWN" && response.withdrawnAt && (
                      <p className="text-xs text-danger">Withdrawn {new Date(response.withdrawnAt).toLocaleString()}</p>
                    )}
                  </td>
                ))}
              </tr>

              {comparison.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row" className="sticky left-0 bg-surface px-4 py-2 text-left font-medium text-text-primary">
                    {item.itemName}
                    {item.specification && <p className="text-xs font-normal text-text-secondary">{item.specification}</p>}
                    <p className="text-xs font-normal text-text-secondary">
                      Requested {item.quantity} {item.unit.toLowerCase()}
                    </p>
                  </th>
                  {comparison.responses.map((response) => {
                    const quoted = response.items.find((i) => i.rfqItemId === item.id);
                    return (
                      <td key={response.id} className="px-4 py-2">
                        {quoted ? (
                          <div>
                            <p className="font-medium text-navy">{formatMinorUnits(quoted.unitPriceMinor, quoted.currency)}</p>
                            <p className="text-xs text-text-secondary">
                              {quoted.quantity} {quoted.unit.toLowerCase()}
                              {quoted.leadTimeDays != null && <> · {quoted.leadTimeDays} days</>}
                            </p>
                          </div>
                        ) : (
                          <span className="text-text-secondary">Not quoted</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              <tr>
                <th scope="row" className="sticky left-0 bg-surface px-4 py-2 text-left font-medium text-text-secondary">
                  Notes
                </th>
                {comparison.responses.map((response) => (
                  <td key={response.id} className="px-4 py-2 text-text-secondary">
                    {response.notes ?? "—"}
                  </td>
                ))}
              </tr>

              <tr>
                <th scope="row" className="sticky left-0 bg-surface px-4 py-2 text-left font-medium text-text-secondary">
                  Response total
                </th>
                {comparison.responses.map((response) => (
                  <td key={response.id} className="px-4 py-2 font-medium text-text-primary">
                    {sumByCurrency(response.items) ?? "—"}
                  </td>
                ))}
              </tr>

              <tr>
                <th scope="row" className="sticky left-0 bg-surface px-4 py-3 text-left font-medium text-text-secondary">
                  Actions
                </th>
                {comparison.responses.map((response) => {
                  const won = isAwarded && comparison.award?.responseId === response.id;
                  const eligible = !isAwarded && response.status === "SUBMITTED";
                  return (
                    <td key={response.id} className="px-4 py-3 align-top">
                      {won && <p className="text-sm font-medium text-success">Awarded to this supplier</p>}
                      {!eligible && !won && response.status === "WITHDRAWN" && (
                        <p className="text-sm text-text-secondary">Withdrawn — not eligible for award</p>
                      )}
                      {!eligible && !won && isAwarded && response.status === "SUBMITTED" && (
                        <p className="text-sm text-text-secondary">Not selected</p>
                      )}
                      {eligible && (
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap gap-2">
                            {response.negotiation ? (
                              <Link href={`/negotiations/${response.negotiation.id}`} className="btn-secondary">
                                {response.negotiation.status === "OPEN" ? "View negotiation" : "View negotiation"}
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
                            {(!response.negotiation || response.negotiation.status !== "OPEN") && (
                              <button
                                type="button"
                                onClick={() => setAwardingResponseId((v) => (v === response.id ? null : response.id))}
                                className="btn-primary"
                              >
                                {awardingResponseId === response.id ? "Cancel" : "Award"}
                              </button>
                            )}
                          </div>
                          {response.negotiation?.status === "OPEN" && (
                            <p className="text-xs text-warning">Resolve the open negotiation (accept or decline) before this response can be awarded.</p>
                          )}
                          {negotiatingResponseId === response.id && (
                            <NegotiateForm
                              organizationId={params.id}
                              rfqId={comparison.id}
                              response={response}
                              items={comparison.items}
                              onDone={async () => {
                                setNegotiatingResponseId(null);
                                await load();
                              }}
                            />
                          )}
                          {awardingResponseId === response.id && (
                            <AwardConfirm
                              organizationId={params.id}
                              rfqId={comparison.id}
                              response={response}
                              items={comparison.items}
                              onDone={async () => {
                                setAwardingResponseId(null);
                                await load();
                              }}
                            />
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
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
