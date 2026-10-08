"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ADMIN_NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/organizations", label: "Organizations" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/kyc", label: "KYC" },
  { href: "/admin/directory", label: "Directory" },
  { href: "/admin/suppliers", label: "Suppliers" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/procurement", label: "Procurement" },
  { href: "/admin/rfqs", label: "RFQs" },
  { href: "/admin/purchase-orders", label: "Purchase orders" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/settings", label: "Settings" },
];

/**
 * The one control-center-wide navigation surface, rendered by
 * RequirePlatformAdmin so every /admin/* page gets it automatically rather
 * than each page wiring its own. Sections with no backend list endpoint yet
 * (Orders, Procurement, RFQs, Purchase orders, Settings) still link
 * somewhere real — their pages explain exactly what's missing instead of
 * being absent from the nav, per the "the control center should be honest
 * and operational" requirement.
 */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 mb-6 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-1 whitespace-nowrap">
        {ADMIN_NAV_ITEMS.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`border-b-2 px-3 py-2 text-sm font-medium ${
                active ? "border-navy text-navy" : "border-transparent text-text-secondary hover:text-navy"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
