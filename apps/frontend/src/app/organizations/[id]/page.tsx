"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { Organization } from "@/lib/types";
import type { MembershipRole } from "@market-hub/shared";

interface OrgResponse {
  organization: Organization;
  membershipRole: MembershipRole;
}

function OrganizationDetailContent() {
  const params = useParams<{ id: string }>();
  const authedFetch = useAuthedFetch();
  const [data, setData] = useState<OrgResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<OrgResponse>(`/organizations/${params.id}`)
      .then(setData)
      .catch((err) => {
        setError(
          err instanceof ApiError && err.status === 403
            ? "You do not have access to this organization."
            : "Could not load this organization."
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (error) {
    return <p className="text-sm text-danger">{error}</p>;
  }

  if (!data) {
    return <p className="text-sm text-text-secondary">Loading…</p>;
  }

  const { organization, membershipRole } = data;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-navy">{organization.legalName}</h1>
          <p className="mt-1 text-sm text-text-secondary">{organization.businessType.replace(/_/g, " ")}</p>
        </div>
        <div className="flex gap-2">
          <StatusBadge status={organization.status} />
          <StatusBadge status={organization.verificationStatus} />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="text-lg font-semibold text-text-primary">Overview</h2>
          <p className="mt-2 text-sm text-text-secondary">
            This is the foundation view for your organization. Catalogue, orders and procurement tools are not part
            of this phase yet.
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-text-secondary">Your role</dt>
              <dd className="mt-1 text-sm font-medium text-text-primary">{membershipRole}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-text-secondary">Verification</dt>
              <dd className="mt-1">
                <StatusBadge status={organization.verificationStatus} />
              </dd>
            </div>
          </dl>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold text-text-primary">Quick actions</h2>
          <div className="mt-4 space-y-2">
            <Link href={`/organizations/${organization.id}/members`} className="btn-secondary w-full">
              View members
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function OrganizationDetailPage() {
  return (
    <RequireAuth>
      <OrganizationDetailContent />
    </RequireAuth>
  );
}
