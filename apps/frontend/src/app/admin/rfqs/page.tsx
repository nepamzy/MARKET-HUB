"use client";

import { RequirePlatformAdmin } from "@/components/RequirePlatformAdmin";
import { UnavailableSection } from "../_components/UnavailableSection";

export default function AdminRfqsPage() {
  return (
    <RequirePlatformAdmin>
      <UnavailableSection
        heading="RFQs"
        statKey="rfqs"
        statLabel="RFQs"
        reason="Listing individual RFQs here would expose buyer and supplier identity, negotiated prices and response details across every organization — the same cross-organization commercial-privacy decision described on the Orders page, extended to procurement. Not built without that explicit decision. Flagged in the phase report."
      />
    </RequirePlatformAdmin>
  );
}
