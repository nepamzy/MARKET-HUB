"use client";

import { RequirePlatformAdmin } from "@/components/RequirePlatformAdmin";
import { UnavailableSection } from "../_components/UnavailableSection";

export default function AdminPurchaseOrdersPage() {
  return (
    <RequirePlatformAdmin>
      <UnavailableSection
        heading="Purchase orders"
        statKey="purchaseOrders"
        statLabel="Purchase orders"
        reason="Listing individual purchase orders here would expose buyer and supplier identity, committed prices and quantities across every organization — the same cross-organization commercial-privacy decision described on the Orders page. Not built without that explicit decision. Flagged in the phase report."
      />
    </RequirePlatformAdmin>
  );
}
