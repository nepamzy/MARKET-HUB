"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { OrganizationWithRole } from "@/lib/types";

function OrganizationsContent() {
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-navy">Organizations</h1>
        <Link href="/organizations/new" className="btn-primary text-sm">
          New organization
        </Link>
      </div>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      {organizations === null && !error && <p className="mt-6 text-sm text-text-secondary">Loading…</p>}

      {organizations && organizations.length === 0 && (
        <div className="mt-6 rounded-control border border-dashed border-border p-8 text-center">
          <p className="text-sm text-text-secondary">You don&apos;t belong to any organization yet.</p>
          <Link href="/organizations/new" className="btn-primary mt-4 inline-flex">
            Create your first organization
          </Link>
        </div>
      )}

      {organizations && organizations.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Business type</th>
                <th className="px-4 py-3 font-medium">Your role</th>
                <th className="px-4 py-3 font-medium">Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {organizations.map((org) => (
                <tr key={org.id} className="hover:bg-background">
                  <td className="px-4 py-3">
                    <Link href={`/organizations/${org.id}`} className="font-medium text-text-primary hover:text-green-dark">
                      {org.legalName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{org.businessType.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-text-secondary">{org.membershipRole}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={org.verificationStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function OrganizationsPage() {
  return (
    <RequireAuth>
      <OrganizationsContent />
    </RequireAuth>
  );
}
