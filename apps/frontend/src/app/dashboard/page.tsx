"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/lib/auth-context";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { OrganizationWithRole } from "@/lib/types";

function DashboardContent() {
  const { user } = useAuth();
  const authedFetch = useAuthedFetch();
  const [organizations, setOrganizations] = useState<OrganizationWithRole[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<{ organizations: OrganizationWithRole[] }>("/users/me/organizations")
      .then((res) => setOrganizations(res.organizations))
      .catch(() => setError("Could not load your organizations right now."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Welcome, {user?.name}</h1>
      <p className="mt-1 text-sm text-text-secondary">Here&apos;s a quick look at your account.</p>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">Your organizations</h2>
            <Link href="/organizations/new" className="btn-secondary text-sm">
              New organization
            </Link>
          </div>

          {error && <p className="mt-4 text-sm text-danger">{error}</p>}

          {organizations === null && !error && (
            <p className="mt-4 text-sm text-text-secondary">Loading…</p>
          )}

          {organizations && organizations.length === 0 && (
            <div className="mt-4 rounded-control border border-dashed border-border p-6 text-center">
              <p className="text-sm text-text-secondary">
                You don&apos;t belong to any organization yet. Create one to represent your business on MARKET HUB.
              </p>
              <Link href="/organizations/new" className="btn-primary mt-4 inline-flex">
                Create organization
              </Link>
            </div>
          )}

          {organizations && organizations.length > 0 && (
            <ul className="mt-4 divide-y divide-border">
              {organizations.map((org) => (
                <li key={org.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link href={`/organizations/${org.id}`} className="font-medium text-text-primary hover:text-green-dark">
                      {org.legalName}
                    </Link>
                    <p className="text-sm text-text-secondary">{org.membershipRole}</p>
                  </div>
                  <StatusBadge status={org.verificationStatus} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold text-text-primary">Account</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-text-secondary">Email</dt>
              <dd className="font-medium text-text-primary">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-text-secondary">Account status</dt>
              <dd className="mt-1">{user && <StatusBadge status={user.accountStatus} />}</dd>
            </div>
          </dl>
          <Link href="/account" className="btn-secondary mt-5 w-full">
            View profile
          </Link>
        </section>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
