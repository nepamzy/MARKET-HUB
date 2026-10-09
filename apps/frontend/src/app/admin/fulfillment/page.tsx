"use client";

import { useCallback, useEffect, useState } from "react";
import { RequirePlatformAdmin } from "@/components/RequirePlatformAdmin";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { AdminStats } from "@/lib/types";
import { UnavailableSection } from "../_components/UnavailableSection";

/**
 * Same honest-unavailable pattern as /admin/orders, /admin/payments and
 * /admin/inventory — plus count-by-status breakdowns for fulfillments and
 * deliveries, which are aggregate only. A per-delivery listing would
 * expose recipient name/phone/address and driver identity across every
 * organization (Rule: do not expose unnecessary personal information) —
 * a materially bigger decision than this pass is authorized to make
 * alone. Flagged in the Phase 12 report, same as every prior section here.
 */
function FulfillmentContent() {
  const authedFetch = useAuthedFetch();
  const [stats, setStats] = useState<AdminStats | null>(null);

  const load = useCallback(async () => {
    try {
      setStats(await authedFetch<AdminStats>("/admin/stats"));
    } catch {
      // Non-fatal — the honest-unavailable section below still renders.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      {stats && (
        <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <section className="card">
            <h2 className="text-sm font-semibold text-text-primary">Fulfillments by status (platform-wide)</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              {Object.entries(stats.fulfillments.byStatus).map(([status, count]) => (
                <div key={status}>
                  <dt className="text-xs text-text-secondary">{status}</dt>
                  <dd className="text-lg font-semibold text-text-primary">{count.toLocaleString()}</dd>
                </div>
              ))}
              {Object.keys(stats.fulfillments.byStatus).length === 0 && (
                <p className="text-sm text-text-secondary">No fulfillments yet.</p>
              )}
            </dl>
          </section>
          <section className="card">
            <h2 className="text-sm font-semibold text-text-primary">Deliveries by status (platform-wide)</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              {Object.entries(stats.deliveries.byStatus).map(([status, count]) => (
                <div key={status}>
                  <dt className="text-xs text-text-secondary">{status}</dt>
                  <dd className="text-lg font-semibold text-text-primary">{count.toLocaleString()}</dd>
                </div>
              ))}
              {Object.keys(stats.deliveries.byStatus).length === 0 && (
                <p className="text-sm text-text-secondary">No deliveries yet.</p>
              )}
            </dl>
            <p className="mt-3 text-xs text-text-secondary">{stats.drivers.total.toLocaleString()} registered driver(s) platform-wide.</p>
          </section>
        </div>
      )}

      <UnavailableSection
        heading="Fulfillment & Delivery"
        statKey="fulfillments"
        statLabel="Fulfillments"
        reason="Listing individual fulfillments or deliveries here would expose recipient name, phone, address and driver identity across every organization on the platform — a materially bigger decision than this pass is authorized to make alone, since no buyer or driver has consented to a platform admin seeing that by default. Building that visibility (and deciding what, if anything, should be redacted) needs an explicit product/architecture decision before it's implemented. Flagged in the Phase 12 report."
      />
    </div>
  );
}

export default function AdminFulfillmentPage() {
  return (
    <RequirePlatformAdmin>
      <FulfillmentContent />
    </RequirePlatformAdmin>
  );
}
