"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { FormAlert } from "@/components/FormAlert";
import { ApiError } from "@/lib/api";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { Organization } from "@/lib/types";
import type { BusinessType } from "@market-hub/shared";
import { BUSINESS_TYPES } from "@market-hub/shared";

const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  PRODUCER_MANUFACTURER: "Producer / Manufacturer",
  WHOLESALER: "Wholesaler",
  RETAILER: "Retailer",
  DIRECT_BUSINESS: "Direct Business",
  LOGISTICS_COMPANY: "Logistics Company",
};

function isBusinessType(value: string | null): value is BusinessType {
  return !!value && (BUSINESS_TYPES as readonly string[]).includes(value);
}

function NewOrganizationForm() {
  const router = useRouter();
  const authedFetch = useAuthedFetch();
  const searchParams = useSearchParams();
  const preselected = searchParams.get("businessType");

  const [legalName, setLegalName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType | "">(
    isBusinessType(preselected) ? preselected : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!businessType) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await authedFetch<{ organization: Organization }>("/organizations", {
        method: "POST",
        body: JSON.stringify({ legalName, businessType }),
      });
      router.push(`/organizations/${res.organization.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the organization. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <form onSubmit={handleSubmit} className="card lg:col-span-2" noValidate>
        <h1 className="text-xl font-semibold text-navy">Create an organization</h1>
        <p className="mt-1 text-sm text-text-secondary">
          An organization is your business identity on MARKET HUB — it holds your catalogue, orders and team.
        </p>

        {error && (
          <div className="mt-4">
            <FormAlert>{error}</FormAlert>
          </div>
        )}

        <div className="mt-6 space-y-5">
          <div>
            <label htmlFor="legalName" className="field-label">
              Organization name
            </label>
            <input
              id="legalName"
              required
              minLength={2}
              className="field-input"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="businessType" className="field-label">
              Business type
            </label>
            <select
              id="businessType"
              required
              className="field-input"
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value as BusinessType)}
            >
              <option value="" disabled>
                Select a business type
              </option>
              {BUSINESS_TYPES.map((type) => (
                <option key={type} value={type}>
                  {BUSINESS_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" disabled={submitting || !businessType} className="btn-primary w-full sm:w-auto">
            {submitting ? "Creating…" : "Create organization"}
          </button>
        </div>
      </form>

      <aside className="card h-fit">
        <h2 className="text-sm font-semibold text-text-primary">Why an organization?</h2>
        <p className="mt-2 text-sm text-text-secondary">
          You&apos;ll be the OWNER of this organization and can invite MANAGER and STAFF teammates later. Business
          type cannot be changed after creation in this phase.
        </p>
      </aside>
    </div>
  );
}

export default function NewOrganizationPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<p className="text-sm text-text-secondary">Loading…</p>}>
        <NewOrganizationForm />
      </Suspense>
    </RequireAuth>
  );
}
