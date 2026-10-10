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
import type { NegotiationEventView, NegotiationView } from "@/lib/types";

function itemName(negotiation: NegotiationView, rfqItemId: string): string {
  return negotiation.rfq.items.find((i) => i.id === rfqItemId)?.itemName ?? rfqItemId;
}

function NegotiationLifecycle({ negotiation }: { negotiation: NegotiationView }) {
  if (negotiation.status === "OPEN") return null;
  return (
    <p
      className={`mt-1 text-sm ${negotiation.status === "ACCEPTED" ? "font-medium text-success" : "text-text-secondary"}`}
    >
      {negotiation.status === "ACCEPTED" ? "Both sides agreed on these terms." : "This negotiation was closed without agreement."}
      {negotiation.closedAt && ` ${new Date(negotiation.closedAt).toLocaleString()}.`}
      {negotiation.closeReason && ` ${negotiation.closeReason}`}
    </p>
  );
}

function EventCard({ negotiation, event }: { negotiation: NegotiationView; event: NegotiationEventView }) {
  const isBuyer = event.authorRole === "BUYER";
  return (
    <li className="relative">
      <span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ${isBuyer ? "bg-navy" : "bg-green"}`} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-text-primary">
          {isBuyer ? negotiation.buyerOrganization.legalName : negotiation.supplierOrganization.legalName}
          <span className="ml-1 font-normal text-text-secondary">({isBuyer ? "buyer" : "supplier"})</span>
        </span>
        <span className="text-xs text-text-secondary">{new Date(event.createdAt).toLocaleString()}</span>
      </div>
      {event.message && <p className="mt-1 text-sm text-text-secondary">{event.message}</p>}
      <ul className="mt-1 space-y-0.5 text-sm text-text-primary">
        {event.items.map((item) => (
          <li key={item.id}>
            {itemName(negotiation, item.rfqItemId)} — {item.quantity} {item.unit.toLowerCase()} @{" "}
            {formatMinorUnits(item.unitPriceMinor, item.currency)}
          </li>
        ))}
      </ul>
    </li>
  );
}

function CounterOfferForm({
  negotiation,
  onCancel,
  onSubmit,
  busy,
}: {
  negotiation: NegotiationView;
  onCancel: () => void;
  onSubmit: (items: { rfqItemId: string; quantity: number; unit: string; currency: string; unitPriceMinor: number }[], message: string) => Promise<void>;
  busy: boolean;
}) {
  const lastEvent = negotiation.events[negotiation.events.length - 1];
  const [drafts, setDrafts] = useState(() =>
    (lastEvent?.items ?? []).map((item) => ({
      rfqItemId: item.rfqItemId,
      quantity: item.quantity,
      unit: item.unit,
      currency: item.currency,
      unitPriceMinor: String(item.unitPriceMinor / 100),
    }))
  );
  const [message, setMessage] = useState("");

  function update(rfqItemId: string, price: string) {
    setDrafts((prev) => prev.map((d) => (d.rfqItemId === rfqItemId ? { ...d, unitPriceMinor: price } : d)));
  }

  return (
    <div className="mt-3 space-y-2">
      {drafts.map((d) => (
        <div key={d.rfqItemId} className="grid grid-cols-[1fr_auto] items-center gap-2">
          <label htmlFor={`price-${d.rfqItemId}`} className="text-sm text-text-secondary">
            {itemName(negotiation, d.rfqItemId)} ({d.quantity} {d.unit.toLowerCase()})
          </label>
          <div className="flex items-center gap-1">
            <span className="text-xs text-text-secondary">{d.currency}</span>
            <input
              id={`price-${d.rfqItemId}`}
              type="number"
              step="0.01"
              min={0}
              className="field-input w-28"
              value={d.unitPriceMinor}
              onChange={(e) => update(d.rfqItemId, e.target.value)}
            />
          </div>
        </div>
      ))}
      <textarea
        placeholder="Message (optional)"
        className="field-input"
        rows={2}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || drafts.some((d) => d.unitPriceMinor === "")}
          onClick={() =>
            onSubmit(
              drafts.map((d) => ({
                rfqItemId: d.rfqItemId,
                quantity: d.quantity,
                unit: d.unit,
                currency: d.currency,
                unitPriceMinor: Math.round(Number(d.unitPriceMinor) * 100),
              })),
              message
            )
          }
          className="btn-primary"
        >
          Send counter-offer
        </button>
        <button type="button" onClick={onCancel} className="btn-tertiary">
          Cancel
        </button>
      </div>
    </div>
  );
}

function NegotiationDetailContent() {
  const params = useParams<{ negotiationId: string }>();
  const authedFetch = useAuthedFetch();
  const [negotiation, setNegotiation] = useState<NegotiationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCounterForm, setShowCounterForm] = useState(false);

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
  const counterparty =
    negotiation && (negotiation.viewerRole === "buyer" ? negotiation.supplierOrganization : negotiation.buyerOrganization);

  async function respond(decision: "COUNTER" | "ACCEPT" | "DECLINE", items?: Parameters<typeof respondBody>[0], message?: string) {
    setActionError(null);
    setBusy(true);
    try {
      const body = respondBody(items, message, decision);
      await authedFetch(`/negotiations/${params.negotiationId}/respond`, { method: "POST", body: JSON.stringify(body) });
      setShowCounterForm(false);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  function respondBody(
    items: { rfqItemId: string; quantity: number; unit: string; currency: string; unitPriceMinor: number }[] | undefined,
    message: string | undefined,
    decision: "COUNTER" | "ACCEPT" | "DECLINE"
  ) {
    const body: Record<string, unknown> = { decision };
    if (items) body.items = items;
    if (message) body.message = message;
    return body;
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!negotiation) return <p className="text-sm text-text-secondary">Loading…</p>;

  return (
    <div className="max-w-2xl">
      <Link href={`/rfqs/${negotiation.rfqId}`} className="text-sm text-text-secondary hover:text-navy">
        ← Back to {negotiation.rfq.reference}
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy">Negotiation</h1>
        <StatusBadge status={negotiation.status} />
      </div>
      <p className="mt-1 text-sm text-text-secondary">
        {negotiation.rfq.title} ({negotiation.rfq.reference}) — negotiating with{" "}
        <span className="font-medium text-text-primary">{counterparty?.legalName}</span> as the {negotiation.viewerRole}.
      </p>
      {negotiation.status === "OPEN" && (
        <p className="mt-1 text-sm text-text-secondary">{isMyTurn ? "It is your turn to respond." : "Waiting on the other side."}</p>
      )}
      <NegotiationLifecycle negotiation={negotiation} />

      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}

      <section className="card mt-6">
        <h2 className="text-lg font-semibold text-text-primary">Offer history</h2>
        <ol className="mt-4 space-y-4 border-l-2 border-border pl-4">
          {negotiation.events.map((event) => (
            <EventCard key={event.id} negotiation={negotiation} event={event} />
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
            <CounterOfferForm
              negotiation={negotiation}
              busy={busy}
              onCancel={() => setShowCounterForm(false)}
              onSubmit={(items, message) => respond("COUNTER", items, message)}
            />
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
