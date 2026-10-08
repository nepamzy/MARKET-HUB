"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { AdminStats } from "@/lib/types";

/**
 * An honest placeholder for a control-center section the backend does not
 * yet support browsing for. Shows the one real number the dashboard can
 * already compute (a platform-wide count), states plainly what is missing
 * and why it wasn't built anyway, and never fabricates a table of rows
 * that don't exist. See the Phase 8 Part B report for the underlying
 * decision this section is flagging.
 */
export function UnavailableSection({
  heading,
  statKey,
  statLabel,
  reason,
}: {
  heading: string;
  statKey: keyof Pick<AdminStats, "orders" | "rfqs" | "purchaseOrders" | "payments" | "inventory">;
  statLabel: string;
  reason: string;
}) {
  const authedFetch = useAuthedFetch();
  const [stats, setStats] = useState<AdminStats | null>(null);

  const load = useCallback(async () => {
    try {
      setStats(await authedFetch<AdminStats>("/admin/stats"));
    } catch {
      // Non-fatal — the count is a bonus; the honest-unavailable message below still renders.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">{heading}</h1>

      {stats && (
        <div className="card mt-4 inline-block">
          <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">{statLabel} (platform-wide)</p>
          <p className="mt-1 text-2xl font-semibold text-navy">{stats[statKey].total.toLocaleString()}</p>
        </div>
      )}

      <div className="mt-6 rounded-card border border-dashed border-border bg-surface p-6">
        <p className="text-sm font-semibold text-text-primary">Browsing individual records isn&apos;t available here yet</p>
        <p className="mt-2 text-sm text-text-secondary">{reason}</p>
      </div>
    </div>
  );
}
