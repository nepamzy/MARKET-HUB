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
import type { NegotiationView } from "@/lib/types";

function NegotiationDetailContent() {
  const params = useParams<{ negotiationId: string }>();
  const authedFetch = useAuthedFetch();
  const [negotiation, setNegotiation] = useState<NegotiationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCounterForm, setShowCounterForm] = useState(false);
  const [unitPriceMinor, setUnitPriceMinor] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      setNegotiation(await authedFetch<NegotiationView>(`/negotiations/${params.negotiationId}`));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "This negotiation does not exist, or you do not have access to it."
          : "Could not load this negotiation."
      );
    }
  }, [params.negotiationId, authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const lastEvent = negotiation?.events[negotiation.events.length - 1];
  const myRole = negotiation?.viewerRole === "buyer" ? "BUYER" : "SUPPLIER";
  const isMyTurn = negotiation?.status === "OPEN" && lastEvent?.authorRole !== myRole;

  async function respond(decision: "COUNTER" | "ACCEPT" | "DECLINE") {
    setActionError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = { decision };
      if (decision === "COUNTER") {
        if (!lastEvent) throw new Error("No prior offer to counter");
        body.message = message || undefined;
        body.items = lastEvent.items.map((item) => ({
          rfqItemId: item.rfqItemId,
          quantity: item.quantity,
          unit: item.unit,
          unitPriceMinor: Math.round(Number(unitPriceMinor) * 100),
          currency: item.currency,
        }));
      } else if (message) {
        body.message = message;
      }
      await authedFetch(`/negotiations/${params.negotiationId}/respond`, { method: "POST", body: JSON.stringify(body) });
      setShowCounterForm(false);
      setUnitPriceMinor("");
      setMessage("");
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!negotiation) return <p className="text-sm text-text-secondary">Loading…</p>;

  return (
    <div className="max-w-2xl">
      <Link href={`/rfqs/${negotiation.rfqId}`} className="text-sm text-text-secondary hover:text-navy">
        ← Back to RFQ
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy">Negotiation</h1>
        <StatusBadge status={negotiation.status} />
      </div>
      <p className="mt-1 text-sm text-text-secondary">
        You are negotiating as the {negotiation.viewerRole}.
        {negotiation.status === "OPEN" && (isMyTurn ? " It is your turn to respond." : " Waiting on the other side.")}
      </p>

      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}
      {negotiation.status === "CLOSED" && negotiation.closeReason && (
        <div className="mt-4">
          <FormAlert tone="error">Closed: {negotiation.closeReason}</FormAlert>
        </div>
      )}

      <section className="card mt-6">
        <h2 className="text-lg font-semibold text-text-primary">Offer history</h2>
        <ol className="mt-4 space-y-4 border-l-2 border-border pl-4">
          {negotiation.events.map((event) => (
            <li key={event.id} className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-green" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-text-primary">{event.authorRole === "BUYER" ? "Buyer" : "Supplier"}</span>
                <span className="text-xs text-text-secondary">{new Date(event.createdAt).toLocaleString()}</span>
              </div>
              {event.message && <p className="mt-1 text-sm text-text-secondary">{event.message}</p>}
              <ul className="mt-1 text-sm text-text-primary">
                {event.items.map((item) => (
                  <li key={item.id}>
                    {item.quantity} {item.unit.toLowerCase()} @ {formatMinorUnits(item.unitPriceMinor, item.currency)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      {isMyTurn && (
        <section className="card mt-6">
          <h2 className="text-sm font-semibold text-text-primary">Respond</h2>
          {!showCounterForm ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => setShowCounterForm(true)} className="btn-secondary">
                Counter-offer
              </button>
              <button type="button" disabled={busy} onClick={() => respond("ACCEPT")} className="btn-primary">
                Accept
              </button>
              <button type="button" disabled={busy} onClick={() => respond("DECLINE")} className="btn-destructive">
                Decline
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <label className="field-label" htmlFor="counterPrice">
                New unit price
              </label>
              <input
                id="counterPrice"
                type="number"
                step="0.01"
                min={0}
                className="field-input"
                value={unitPriceMinor}
                onChange={(e) => setUnitPriceMinor(e.target.value)}
              />
              <textarea
                placeholder="Message (optional)"
                className="field-input"
                rows={2}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <div className="flex gap-2">
                <button type="button" disabled={busy || !unitPriceMinor} onClick={() => respond("COUNTER")} className="btn-primary">
                  Send counter-offer
                </button>
                <button type="button" onClick={() => setShowCounterForm(false)} className="btn-tertiary">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default function NegotiationDetailPage() {
  return (
    <RequireAuth>
      <NegotiationDetailContent />
    </RequireAuth>
  );
}
