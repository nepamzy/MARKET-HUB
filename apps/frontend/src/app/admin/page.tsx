"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RequirePlatformAdmin } from "@/components/RequirePlatformAdmin";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { AdminStats } from "@/lib/types";

function StatTile({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="card block hover:border-navy/40">
      <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-navy">{value.toLocaleString()}</p>
    </Link>
  );
}

function DashboardContent() {
  const authedFetch = useAuthedFetch();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStats(await authedFetch<AdminStats>("/admin/stats"));
    } catch {
      setError("Could not load platform statistics.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Platform overview</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Real, live counts from the platform database. Nothing here is estimated or fabricated.
      </p>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      {stats === null && !error && <p className="mt-6 text-sm text-text-secondary">Loading…</p>}

      {stats && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <StatTile label="Organizations" value={stats.organizations.total} href="/admin/organizations" />
            <StatTile label="Users" value={stats.users.total} href="/admin/users" />
            <StatTile label="KYC pending review" value={stats.kyc.pendingReview} href="/admin/kyc" />
            <StatTile label="Discoverable suppliers" value={stats.directory.discoverable} href="/admin/directory" />
            <StatTile label="Products" value={stats.products.total} href="/admin/products" />
            <StatTile label="Orders" value={stats.orders.total} href="/admin/orders" />
            <StatTile label="Payments" value={stats.payments.total} href="/admin/payments" />
            <StatTile label="Products tracked" value={stats.inventory.total} href="/admin/inventory" />
            <StatTile label="Fulfillments" value={stats.fulfillments.total} href="/admin/fulfillment" />
            <StatTile label="Deliveries" value={stats.deliveries.total} href="/admin/fulfillment" />
            <StatTile label="Drivers" value={stats.drivers.total} href="/admin/users" />
            <StatTile label="RFQs" value={stats.rfqs.total} href="/admin/rfqs" />
            <StatTile label="Purchase orders" value={stats.purchaseOrders.total} href="/admin/purchase-orders" />
          </div>

          <section className="card mt-6">
            <h2 className="text-sm font-semibold text-text-primary">Organizations by verification status</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Object.entries(stats.organizations.byVerification).map(([status, count]) => (
                <div key={status}>
                  <dt className="text-xs text-text-secondary">{status.replace(/_/g, " ")}</dt>
                  <dd className="text-lg font-semibold text-text-primary">{count.toLocaleString()}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <RequirePlatformAdmin>
      <DashboardContent />
    </RequirePlatformAdmin>
  );
}
