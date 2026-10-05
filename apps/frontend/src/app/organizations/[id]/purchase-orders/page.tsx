"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { PurchaseOrderList } from "@/components/po/PurchaseOrderList";

export default function PurchaseOrdersPage() {
  return (
    <RequireAuth>
      <PurchaseOrderList side="buyer" />
    </RequireAuth>
  );
}
