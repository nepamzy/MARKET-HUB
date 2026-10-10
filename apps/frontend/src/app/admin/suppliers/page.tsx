"use client";

import { RequirePlatformAdmin } from "@/components/RequirePlatformAdmin";
import { DirectoryOversight } from "../_components/DirectoryOversight";

export default function AdminSuppliersPage() {
  return (
    <RequirePlatformAdmin>
      <DirectoryOversight
        heading="Suppliers"
        description="Supplier oversight and the business directory are the same underlying data — every organization with a configured supplier profile — so this page and Directory show identical records. There is no separate supplier-only dataset on the backend."
      />
    </RequirePlatformAdmin>
  );
}
