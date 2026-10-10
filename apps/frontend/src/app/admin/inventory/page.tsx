"use client";

import { RequirePlatformAdmin } from "@/components/RequirePlatformAdmin";
import { UnavailableSection } from "../_components/UnavailableSection";

/**
 * Same honest-unavailable pattern as /admin/orders, /admin/rfqs,
 * /admin/purchase-orders and /admin/payments — a per-product onHand/
 * reserved/available listing is exactly the cross-organization
 * commercial content (and, for a marketplace seller, competitively
 * sensitive operational data) those pages already decline to expose
 * without an explicit decision. Flagged in the Phase 11 report.
 */
export default function AdminInventoryPage() {
  return (
    <RequirePlatformAdmin>
      <UnavailableSection
        heading="Inventory"
        statKey="inventory"
        statLabel="Products stock-tracked"
        reason="Listing per-product stock levels here would expose exactly how much of a product each organization has on hand — competitively sensitive operational data no business has consented to a platform admin seeing by default, and a materially bigger decision than this pass is authorized to make alone. Building that visibility (and deciding what, if anything, should be redacted) needs an explicit product/architecture decision before it's implemented. Flagged in the Phase 11 report."
      />
    </RequirePlatformAdmin>
  );
}
