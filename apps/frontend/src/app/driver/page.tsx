"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { DeliveryView } from "@/lib/types";

function DriverDeliveriesContent() {
  const authedFetch = useAuthedFetch();
  const [deliveries, setDeliveries] = useState<DeliveryView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch<{ deliveries: DeliveryView[] }>("/driver/deliveries");
      setDeliveries(res.deliveries);
    } catch {
      setError("Could not load your assigned deliveries.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!deliveries) return <p className="text-sm text-text-secondary">Loading…</p>;

  const active = deliveries.filter((d) => d.status === "PENDING_PICKUP" || d.status === "IN_TRANSIT");
  const past = deliveries.filter((d) => d.status === "DELIVERED" || d.status === "FAILED");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">My deliveries</h1>
      <p className="mt-1 text-sm text-text-secondary">Only deliveries assigned to you.</p>

      {deliveries.length === 0 && (
        <div className="mt-6 rounded-control border border-dashed border-border p-8 text-center">
          <p className="text-sm text-text-secondary">No deliveries assigned to you yet.</p>
        </div>
      )}

      {active.length > 0 && (
        <div className="mt-6 space-y-3">
          {active.map((d) => (
            <Link key={d.id} href={`/driver/deliveries/${d.id}`} className="card block hover:border-navy/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-text-primary">{d.recipientName}</p>
                <StatusBadge status={d.status} />
              </div>
              <p className="mt-1 text-sm text-text-secondary">
                {d.destinationAddressLine}, {d.destinationCity}
              </p>
            </Link>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-text-primary">Completed</h2>
          <div className="mt-3 space-y-2">
            {past.map((d) => (
              <Link key={d.id} href={`/driver/deliveries/${d.id}`} className="card block hover:border-navy/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-text-primary">{d.recipientName}</p>
                  <StatusBadge status={d.status} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DriverDeliveriesPage() {
  return (
    <RequireAuth>
      <DriverDeliveriesContent />
    </RequireAuth>
  );
}
