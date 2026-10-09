"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FormAlert } from "@/components/FormAlert";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { DeliveryEventView, DeliveryLocationView, DeliveryView } from "@/lib/types";

/**
 * No live-streaming/WebSocket infrastructure and no mapping provider are
 * configured in this environment (see the phase report) — this is an
 * honest polling refresh of real recorded locations, not a fake live map.
 * Every value shown here (including staleness) comes straight from the
 * backend's own computation in delivery.service.ts, never guessed here.
 */
const LOCATION_POLL_MS = 15_000;

function EventsTimeline({ events }: { events: DeliveryEventView[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-text-secondary">No delivery events yet.</p>;
  }
  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className="flex items-start gap-3">
          <StatusBadge status={e.type} />
          <div>
            <p className="text-sm text-text-secondary">{new Date(e.createdAt).toLocaleString()}</p>
            {e.note && <p className="text-sm text-text-primary">{e.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function LocationPanel({ deliveryId, active }: { deliveryId: string; active: boolean }) {
  const authedFetch = useAuthedFetch();
  const [location, setLocation] = useState<DeliveryLocationView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch<{ location: DeliveryLocationView | null }>(`/deliveries/${deliveryId}/location`);
      setLocation(res.location);
    } catch {
      // Non-fatal — the panel just keeps showing its last known state.
    } finally {
      setLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryId]);

  useEffect(() => {
    load();
    if (!active) return;
    timerRef.current = setInterval(load, LOCATION_POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load, active]);

  return (
    <section className="card">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Driver location</h2>
        <button type="button" onClick={load} className="btn-tertiary px-0 text-xs">
          Refresh
        </button>
      </div>

      {!loaded && <p className="mt-3 text-sm text-text-secondary">Loading…</p>}

      {loaded && !location && (
        <p className="mt-3 text-sm text-text-secondary">Waiting for the driver&apos;s first location update.</p>
      )}

      {loaded && location && (
        <div className="mt-3">
          <p className="text-sm text-text-primary">
            {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
          </p>
          <p className={`mt-1 text-xs ${location.stale ? "text-warning" : "text-text-secondary"}`}>
            {location.stale ? "Stale — " : "Last updated "}
            {new Date(location.recordedAt).toLocaleString()}
          </p>
          {active && <p className="mt-2 text-xs text-text-secondary">Refreshing automatically every 15 seconds.</p>}
        </div>
      )}
    </section>
  );
}

function DeliveryDetailContent() {
  const params = useParams<{ id: string }>();
  const authedFetch = useAuthedFetch();
  const [delivery, setDelivery] = useState<DeliveryView | null>(null);
  const [events, setEvents] = useState<DeliveryEventView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [driverEmail, setDriverEmail] = useState("");
  const [confirmingFail, setConfirmingFail] = useState(false);
  const [failReason, setFailReason] = useState("");

  const load = useCallback(async () => {
    try {
      const [deliveryRes, eventsRes] = await Promise.all([
        authedFetch<{ delivery: DeliveryView }>(`/deliveries/${params.id}`),
        authedFetch<{ events: DeliveryEventView[] }>(`/deliveries/${params.id}/events`),
      ]);
      setDelivery(deliveryRes.delivery);
      setEvents(eventsRes.events);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "This delivery does not exist, or you do not have access to it."
          : "Could not load this delivery."
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function assignDriver(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setBusy(true);
    try {
      const res = await authedFetch<{ delivery: DeliveryView }>(`/deliveries/${params.id}/assign-driver`, {
        method: "POST",
        body: JSON.stringify({ driverEmail }),
      });
      setDelivery(res.delivery);
      setDriverEmail("");
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not assign that driver.");
    } finally {
      setBusy(false);
    }
  }

  async function failDelivery() {
    setActionError(null);
    setBusy(true);
    try {
      const res = await authedFetch<{ delivery: DeliveryView }>(`/deliveries/${params.id}/fail`, {
        method: "POST",
        body: JSON.stringify({ reason: failReason }),
      });
      setDelivery(res.delivery);
      setConfirmingFail(false);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not mark this delivery failed.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!delivery) return <p className="text-sm text-text-secondary">Loading…</p>;

  const isSeller = delivery.viewerRole === "seller";
  const isDriver = delivery.viewerRole === "driver";
  const canFail = (isSeller || isDriver) && (delivery.status === "PENDING_PICKUP" || delivery.status === "IN_TRANSIT");

  return (
    <div className="max-w-4xl">
      <Link href={`/fulfillments/${delivery.fulfillmentId}`} className="text-sm text-text-secondary hover:text-navy">
        ← Back to fulfillment
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy">Delivery</h1>
        <StatusBadge status={delivery.status} />
      </div>

      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}

      {delivery.status === "FAILED" && delivery.failureReason && (
        <div className="mt-4">
          <FormAlert tone="error">Delivery failed: {delivery.failureReason}</FormAlert>
        </div>
      )}

      {isDriver && delivery.status !== "DELIVERED" && delivery.status !== "FAILED" && (
        <div className="mt-4">
          <Link href={`/driver/deliveries/${delivery.id}`} className="btn-primary">
            Open driver update view
          </Link>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card">
            <h2 className="text-sm font-semibold text-text-primary">Destination</h2>
            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-text-secondary">Recipient</dt>
                <dd className="text-sm text-text-primary">{delivery.recipientName}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-text-secondary">Phone</dt>
                <dd className="text-sm text-text-primary">{delivery.recipientPhone}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-text-secondary">Address</dt>
                <dd className="text-sm text-text-primary">
                  {delivery.destinationAddressLine}, {delivery.destinationCity}
                  {delivery.destinationState ? `, ${delivery.destinationState}` : ""}, {delivery.destinationCountry}
                </dd>
              </div>
            </dl>
          </section>

          {isSeller && !delivery.driverUserId && delivery.status === "PENDING_PICKUP" && (
            <section className="card">
              <h2 className="text-sm font-semibold text-text-primary">Assign a driver</h2>
              <form onSubmit={assignDriver} className="mt-3 flex flex-wrap items-end gap-2">
                <div className="flex-1">
                  <label className="text-xs uppercase tracking-wide text-text-secondary">Driver email</label>
                  <input required type="email" className="field-input mt-1" value={driverEmail} onChange={(e) => setDriverEmail(e.target.value)} placeholder="driver@example.com" />
                </div>
                <button type="submit" disabled={busy} className="btn-primary">
                  {busy ? "Assigning…" : "Assign driver"}
                </button>
              </form>
            </section>
          )}

          {delivery.driverUser && (
            <section className="card">
              <h2 className="text-sm font-semibold text-text-primary">Driver</h2>
              <p className="mt-2 text-sm text-text-primary">{delivery.driverUser.name}</p>
              {isSeller && <p className="text-sm text-text-secondary">{delivery.driverUser.email}</p>}
            </section>
          )}

          {delivery.driverUserId && <LocationPanel deliveryId={delivery.id} active={delivery.status === "IN_TRANSIT"} />}

          <section className="card">
            <h2 className="text-sm font-semibold text-text-primary">Delivery events</h2>
            <div className="mt-3">
              <EventsTimeline events={events} />
            </div>
          </section>

          {canFail && (
            <section className="card">
              <button type="button" className="btn-destructive" onClick={() => setConfirmingFail(true)}>
                Report failed delivery
              </button>
            </section>
          )}
        </div>

        <section className="card h-fit">
          <h2 className="text-sm font-semibold text-text-primary">Summary</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-text-secondary">Status</dt>
              <dd>
                <StatusBadge status={delivery.status} />
              </dd>
            </div>
            {delivery.assignedAt && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-text-secondary">Assigned</dt>
                <dd className="text-text-primary">{new Date(delivery.assignedAt).toLocaleString()}</dd>
              </div>
            )}
            {delivery.pickedUpAt && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-text-secondary">Picked up</dt>
                <dd className="text-text-primary">{new Date(delivery.pickedUpAt).toLocaleString()}</dd>
              </div>
            )}
            {delivery.deliveredAt && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-text-secondary">Delivered</dt>
                <dd className="text-text-primary">{new Date(delivery.deliveredAt).toLocaleString()}</dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      <ConfirmDialog
        open={confirmingFail}
        title="Report this delivery as failed?"
        confirmLabel="Report failed delivery"
        busy={busy}
        onConfirm={failDelivery}
        onCancel={() => setConfirmingFail(false)}
      >
        <label className="text-xs uppercase tracking-wide text-text-secondary">Reason</label>
        <textarea required rows={3} className="field-input mt-1 w-full" value={failReason} onChange={(e) => setFailReason(e.target.value)} />
      </ConfirmDialog>
    </div>
  );
}

export default function DeliveryDetailPage() {
  return (
    <RequireAuth>
      <DeliveryDetailContent />
    </RequireAuth>
  );
}
