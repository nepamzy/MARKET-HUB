"use client";

import { RequirePlatformAdmin } from "@/components/RequirePlatformAdmin";
import { DirectoryOversight } from "../_components/DirectoryOversight";

export default function AdminDirectoryPage() {
  return (
    <RequirePlatformAdmin>
      <DirectoryOversight
        heading="Business directory"
        description="All businesses, including those not currently visible in the public directory."
      />
    </RequirePlatformAdmin>
  );
}
