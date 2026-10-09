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
import type { DeliveryView } from "@/lib/types";

function DriverDeliveryUpdateContent() {
  const params = useParams<{ id: string }>();
  const authedFetch = useAuthedFetch();
  const [delivery, setDelivery] = useState<DeliveryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [confirmingPod, setConfirmingPod] = useState(false);
  const [confirmingFail, setConfirmingFail] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [notes, setNotes] = useState("");
  const [failReason, setFailReason] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await authedFetch<{ delivery: DeliveryView }>(`/deliveries/${params.id}`);
      setDelivery(res.delivery);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "This delivery is not assigned to you, or does not exist."
          : "Could not load this delivery."
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function sendLocation(latitude: number, longitude: number) {
    setActionError(null);
    setLocationStatus(null);
    try {
      await authedFetch(`/deliveries/${params.id}/location`, {
        method: "POST",
        body: JSON.stringify({ latitude, longitude }),
      });
      setLocationStatus(`Sent ${latitude.toFixed(5)}, ${longitude.toFixed(5)} at ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not send this location.");
    }
  }

  function useDeviceLocation() {
    if (!navigator.geolocation) {
      setActionError("This browser does not support device location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => sendLocation(pos.coords.latitude, pos.coords.longitude),
      () => setActionError("Could not get your device's location — check location permissions, or enter coordinates manually below.")
    );
  }

  async function sendManualLocation(e: React.FormEvent) {
    e.preventDefault();
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setActionError("Enter valid latitude and longitude values.");
      return;
    }
    await sendLocation(lat, lng);
  }

  async function markPickedUp() {
    setActionError(null);
    setBusy(true);
    try {
      const res = await authedFetch<{ delivery: DeliveryView }>(`/deliveries/${params.id}/pickup`, { method: "POST" });
      setDelivery(res.delivery);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not mark this delivery picked up.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPod() {
    setActionError(null);
    setBusy(true);
    try {
      const res = await authedFetch<{ delivery: DeliveryView }>(`/deliveries/${params.id}/proof-of-delivery`, {
        method: "POST",
        body: JSON.stringify({ recipientName: recipientName || undefined, notes: notes || undefined }),
      });
      setDelivery(res.delivery);
      setConfirmingPod(false);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not confirm proof of delivery.");
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

  return (
    <div className="max-w-2xl">
      <Link href="/driver" className="text-sm text-text-secondary hover:text-navy">
        ← My deliveries
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy">{delivery.recipientName}</h1>
        <StatusBadge status={delivery.status} />
      </div>
      <p className="mt-1 text-sm text-text-secondary">
        {delivery.destinationAddressLine}, {delivery.destinationCity}
        {delivery.destinationState ? `, ${delivery.destinationState}` : ""}, {delivery.destinationCountry}
      </p>
      <p className="mt-1 text-sm text-text-secondary">{delivery.recipientPhone}</p>

      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}

      {delivery.status === "PENDING_PICKUP" && (
        <section className="card mt-6">
          <h2 className="text-sm font-semibold text-text-primary">Pickup</h2>
          <p className="mt-2 text-sm text-text-secondary">Confirm once you have collected this order from the seller.</p>
          <button type="button" disabled={busy} onClick={markPickedUp} className="btn-primary mt-3">
            {busy ? "Confirming…" : "Mark picked up"}
          </button>
        </section>
      )}

      {delivery.status === "IN_TRANSIT" && (
        <>
          <section className="card mt-6">
            <h2 className="text-sm font-semibold text-text-primary">Share your location</h2>
            <p className="mt-2 text-sm text-text-secondary">
              A real reading from this device — never simulated. The sender and receiver see whatever you send here.
            </p>
            <button type="button" onClick={useDeviceLocation} className="btn-primary mt-3">
              Use my device location
            </button>
            <form onSubmit={sendManualLocation} className="mt-3 flex flex-wrap items-end gap-2">
              <div>
                <label className="text-xs uppercase tracking-wide text-text-secondary">Latitude</label>
                <input className="field-input mt-1 w-32" value={manualLat} onChange={(e) => setManualLat(e.target.value)} placeholder="6.5244" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-text-secondary">Longitude</label>
                <input className="field-input mt-1 w-32" value={manualLng} onChange={(e) => setManualLng(e.target.value)} placeholder="3.3792" />
              </div>
              <button type="submit" className="btn-secondary">
                Send manually
              </button>
            </form>
            {locationStatus && <p className="mt-2 text-xs text-success">{locationStatus}</p>}
          </section>

          <section className="card mt-6">
            <h2 className="text-sm font-semibold text-text-primary">Complete this delivery</h2>
            <button type="button" onClick={() => setConfirmingPod(true)} className="btn-primary mt-3">
              Confirm proof of delivery
            </button>
          </section>
        </>
      )}

      {(delivery.status === "PENDING_PICKUP" || delivery.status === "IN_TRANSIT") && (
        <section className="card mt-6">
          <button type="button" className="btn-destructive" onClick={() => setConfirmingFail(true)}>
            Report failed delivery
          </button>
        </section>
      )}

      {delivery.status === "DELIVERED" && (
        <div className="mt-6">
          <FormAlert tone="success">
            Delivered {delivery.deliveredAt ? new Date(delivery.deliveredAt).toLocaleString() : ""}.
          </FormAlert>
        </div>
      )}
      {delivery.status === "FAILED" && (
        <div className="mt-6">
          <FormAlert tone="error">Failed: {delivery.failureReason}</FormAlert>
        </div>
      )}

      <ConfirmDialog
        open={confirmingPod}
        title="Confirm proof of delivery?"
        confirmLabel="Confirm delivered"
        busy={busy}
        onConfirm={confirmPod}
        onCancel={() => setConfirmingPod(false)}
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wide text-text-secondary">Who received it (optional)</label>
            <input className="field-input mt-1 w-full" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-text-secondary">Notes (optional)</label>
            <textarea rows={2} className="field-input mt-1 w-full" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </ConfirmDialog>

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

export default function DriverDeliveryUpdatePage() {
  return (
    <RequireAuth>
      <DriverDeliveryUpdateContent />
    </RequireAuth>
  );
}
