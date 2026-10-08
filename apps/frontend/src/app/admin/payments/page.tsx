"use client";

import { useCallback, useEffect, useState } from "react";
import { RequirePlatformAdmin } from "@/components/RequirePlatformAdmin";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { AdminStats } from "@/lib/types";
import { UnavailableSection } from "../_components/UnavailableSection";

/**
 * Same honest-unavailable pattern as /admin/orders, /admin/rfqs and
 * /admin/purchase-orders — plus a count-by-status breakdown, which is
 * aggregate information only (no reference, buyer identity, order link,
 * or amount), so it carries none of the cross-organization commercial
 * exposure a per-payment row listing would. Per the Phase 10 payments
 * requirement ("optional read-only payment visibility ... no cross-org
 * financial controls without proper authorization"), a full itemized
 * listing is a bigger decision than this pass is authorized to make
 * unilaterally — flagged in the phase report, same as orders/RFQs/POs.
 */
function PaymentsContent() {
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
        <section className="card mb-6">
          <h2 className="text-sm font-semibold text-text-primary">Payments by status (platform-wide)</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(stats.payments.byStatus).map(([status, count]) => (
              <div key={status}>
                <dt className="text-xs text-text-secondary">{status}</dt>
                <dd className="text-lg font-semibold text-text-primary">{count.toLocaleString()}</dd>
              </div>
            ))}
            {Object.keys(stats.payments.byStatus).length === 0 && (
              <p className="text-sm text-text-secondary">No payments have been initiated yet.</p>
            )}
          </dl>
        </section>
      )}

      <UnavailableSection
        heading="Payments"
        statKey="payments"
        statLabel="Payments"
        reason="Listing individual payments here would expose order linkage, buyer identity, amounts and provider references across every organization on the platform — a materially bigger decision than this pass is authorized to make alone, since no buyer has consented to a platform admin seeing their payment details by default. Building that visibility (and deciding what, if anything, should be redacted) needs an explicit product/architecture decision before it's implemented. Flagged in the Phase 10 report."
      />
    </div>
  );
}

export default function AdminPaymentsPage() {
  return (
    <RequirePlatformAdmin>
      <PaymentsContent />
    </RequirePlatformAdmin>
  );
}
