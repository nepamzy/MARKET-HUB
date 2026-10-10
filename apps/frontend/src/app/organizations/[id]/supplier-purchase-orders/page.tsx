"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { PurchaseOrderList } from "@/components/po/PurchaseOrderList";

export default function SupplierPurchaseOrdersPage() {
  return (
    <RequireAuth>
      <PurchaseOrderList side="supplier" />
    </RequireAuth>
  );
}
