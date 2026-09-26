"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { FormAlert } from "@/components/FormAlert";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { OnboardingStatus } from "@/lib/types";

const PROFILE_FIELDS: { key: keyof OnboardingStatus["profile"]; label: string; required?: boolean }[] = [
  { key: "contactName", label: "Contact name" },
  { key: "contactEmail", label: "Contact email", required: true },
  { key: "contactPhone", label: "Contact phone", required: true },
  { key: "addressLine1", label: "Address", required: true },
  { key: "city", label: "City", required: true },
  { key: "state", label: "State / region" },
  { key: "country", label: "Country", required: true },
  { key: "registrationNumber", label: "Business registration number" },
  { key: "description", label: "Business description" },
];

function OnboardingContent() {
  const params = useParams<{ id: string }>();
  const organizationId = params.id;
  const authedFetch = useAuthedFetch();

  const [data, setData] = useState<OnboardingStatus | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch<OnboardingStatus>(`/organizations/${organizationId}/onboarding`);
      setData(res);
      setForm(
        Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, res.profile[f.key] ?? ""]))
      );
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 403
          ? "You do not have access to this business."
          : "Could not load onboarding status."
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setSaving(true);
    try {
      await authedFetch(`/organizations/${organizationId}/profile`, {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      setSaved(true);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not save the profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitKyc() {
    setActionError(null);
    setSubmitting(true);
    try {
      await authedFetch(`/organizations/${organizationId}/kyc/submit`, { method: "POST" });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not submit for verification.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <p className="text-sm text-text-secondary">Loading…</p>;

  const kycStatus = data.kyc?.status ?? "NOT_STARTED";
  const canEditProfile = true; // route-level 403 already enforces MANAGER+ server-side
  const canSubmit = data.profileComplete && (!data.kyc || data.kyc.status === "NEEDS_INFORMATION" || data.kyc.status === "REJECTED");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Business onboarding</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Complete your business profile, then submit for verification.
      </p>

      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}

      <section className="card mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Verification status</h2>
          <StatusBadge status={kycStatus} />
        </div>
        {data.kyc?.reviewNote && (kycStatus === "NEEDS_INFORMATION" || kycStatus === "REJECTED") && (
          <div className="mt-3">
            <FormAlert>{data.kyc.reviewNote}</FormAlert>
          </div>
        )}
        {kycStatus === "VERIFIED" && (
          <p className="mt-3 text-sm text-success">
            Verified{data.kyc?.reviewedByName ? ` by ${data.kyc.reviewedByName}` : ""}
            {data.kyc?.reviewedAt ? ` on ${new Date(data.kyc.reviewedAt).toLocaleDateString()}` : ""}.
          </p>
        )}
        {!data.profileComplete && (
          <p className="mt-3 text-sm text-text-secondary">
            Complete the required fields below before submitting for verification.
          </p>
        )}
        {canSubmit && (
          <button type="button" onClick={handleSubmitKyc} disabled={submitting} className="btn-primary mt-4">
            {submitting ? "Submitting…" : data.kyc ? "Resubmit for verification" : "Submit for verification"}
          </button>
        )}
      </section>

      <section className="card mt-6">
        <h2 className="text-lg font-semibold text-text-primary">Business profile</h2>
        <form onSubmit={handleSaveProfile} className="mt-4 grid gap-4 sm:grid-cols-2">
          {PROFILE_FIELDS.map((field) => (
            <div key={field.key} className={field.key === "description" ? "sm:col-span-2" : undefined}>
              <label className="text-xs uppercase tracking-wide text-text-secondary" htmlFor={field.key}>
                {field.label}
                {field.required && " *"}
              </label>
              <input
                id={field.key}
                className="field-input mt-1"
                value={form[field.key] ?? ""}
                disabled={!canEditProfile}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, [field.key]: e.target.value }));
                  setSaved(false);
                }}
              />
            </div>
          ))}
          <div className="sm:col-span-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : "Save profile"}
            </button>
            {saved && <span className="ml-3 text-sm text-success">Saved.</span>}
          </div>
        </form>
      </section>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <RequireAuth>
      <OnboardingContent />
    </RequireAuth>
  );
}
