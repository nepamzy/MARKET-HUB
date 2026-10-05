"use client";

import { RequirePlatformAdmin } from "@/components/RequirePlatformAdmin";
import { UnavailableSection } from "../_components/UnavailableSection";

export default function AdminOrdersPage() {
  return (
    <RequirePlatformAdmin>
      <UnavailableSection
        heading="Orders"
        statKey="orders"
        statLabel="Orders"
        reason="Listing individual orders here would expose buyer identity, seller identity, line items and prices across every organization on the platform — a materially bigger decision than this pass is authorized to make alone, since no buyer or seller has consented to a platform admin seeing their commercial order details by default. Building that visibility (and deciding what, if anything, should be redacted) needs an explicit product/architecture decision before it's implemented. Flagged in the phase report."
      />
    </RequirePlatformAdmin>
  );
}
