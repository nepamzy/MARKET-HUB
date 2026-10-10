"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RequirePlatformAdmin } from "@/components/RequirePlatformAdmin";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { AdminStats } from "@/lib/types";

function ProcurementContent() {
  const authedFetch = useAuthedFetch();
  const [stats, setStats] = useState<AdminStats | null>(null);

  const load = useCallback(async () => {
    try {
      setStats(await authedFetch<AdminStats>("/admin/stats"));
    } catch {
      // Non-fatal — see the explanatory section below either way.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Procurement</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Platform-wide view of the B2B procurement engine (Requisition → RFQ → Supplier Response → Comparison →
        Negotiation → Award → Purchase Order).
      </p>

      {stats && (
        <div className="mt-4 flex flex-wrap gap-4">
          <Link href="/admin/rfqs" className="card hover:border-navy/40">
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">RFQs</p>
            <p className="mt-1 text-2xl font-semibold text-navy">{stats.rfqs.total.toLocaleString()}</p>
          </Link>
          <Link href="/admin/purchase-orders" className="card hover:border-navy/40">
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Purchase orders</p>
            <p className="mt-1 text-2xl font-semibold text-navy">{stats.purchaseOrders.total.toLocaleString()}</p>
          </Link>
        </div>
      )}

      <div className="mt-6 rounded-card border border-dashed border-border bg-surface p-6">
        <p className="text-sm font-semibold text-text-primary">Browsing individual procurement records is not available here yet</p>
        <p className="mt-2 text-sm text-text-secondary">
          Requisitions, RFQs, supplier responses, negotiations and purchase orders all carry cross-organization
          commercial content (prices, negotiated terms, buyer/supplier identity) that no business has consented to
          share with a platform admin by default. Exposing that platform-wide needs an explicit decision before
          building it — see the RFQs and Purchase orders pages, and the Phase 8 Part B report.
        </p>
      </div>
    </div>
  );
}

export default function AdminProcurementPage() {
  return (
    <RequirePlatformAdmin>
      <ProcurementContent />
    </RequirePlatformAdmin>
  );
}
