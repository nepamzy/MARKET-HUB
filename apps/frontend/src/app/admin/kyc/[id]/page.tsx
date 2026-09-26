"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequirePlatformAdmin } from "@/components/RequirePlatformAdmin";
import { FormAlert } from "@/components/FormAlert";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { KycSubmissionDetail } from "@/lib/types";

const PROFILE_ROWS: { key: keyof KycSubmissionDetail["organization"]; label: string }[] = [
  { key: "legalName", label: "Legal name" },
  { key: "businessType", label: "Business type" },
  { key: "registrationNumber", label: "Registration number" },
  { key: "contactName", label: "Contact name" },
  { key: "contactEmail", label: "Contact email" },
  { key: "contactPhone", label: "Contact phone" },
  { key: "addressLine1", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State / region" },
  { key: "country", label: "Country" },
  { key: "description", label: "Description" },
];

function AdminKycDetailContent() {
  const params = useParams<{ id: string }>();
  const authedFetch = useAuthedFetch();

  const [submission, setSubmission] = useState<KycSubmissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSubmission(await authedFetch<KycSubmissionDetail>(`/admin/kyc/${params.id}`));
    } catch {
      setError("Could not load this submission.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleReview(decision: "VERIFIED" | "REJECTED" | "NEEDS_INFORMATION") {
    setActionError(null);
    setSubmitting(decision);
    try {
      await authedFetch(`/admin/kyc/${params.id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ decision, note: note.trim() || undefined }),
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not record this decision.");
    } finally {
      setSubmitting(null);
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!submission) return <p className="text-sm text-text-secondary">Loading…</p>;

  const decided = submission.status !== "SUBMITTED";

  return (
    <div>
      <Link href="/admin/kyc" className="text-sm text-text-secondary hover:text-navy">
        ← Back to KYC review
      </Link>

      <div className="mt-3 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy">{submission.organization.legalName}</h1>
        <StatusBadge status={submission.status} />
      </div>

      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}

      <section className="card mt-6">
        <h2 className="text-lg font-semibold text-text-primary">Submitted business information</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {PROFILE_ROWS.map((row) => (
            <div key={row.key}>
              <dt className="text-xs uppercase tracking-wide text-text-secondary">{row.label}</dt>
              <dd className="mt-1 text-sm text-text-primary">
                {String(submission.organization[row.key] ?? "—").replace(/_/g, " ")}
              </dd>
            </div>
          ))}
        </dl>
        {submission.submittedBy && (
          <p className="mt-4 text-xs text-text-secondary">
            Submitted by {submission.submittedBy.name} ({submission.submittedBy.email})
            {submission.submittedAt ? ` on ${new Date(submission.submittedAt).toLocaleString()}` : ""}
          </p>
        )}
      </section>

      {decided ? (
        <section className="card mt-6">
          <h2 className="text-lg font-semibold text-text-primary">Decision recorded</h2>
          <p className="mt-2 text-sm text-text-secondary">
            {submission.reviewedBy ? `Reviewed by ${submission.reviewedBy.name}` : "Reviewed"}
            {submission.reviewedAt ? ` on ${new Date(submission.reviewedAt).toLocaleString()}` : ""}.
          </p>
          {submission.reviewNote && <p className="mt-2 text-sm text-text-primary">{submission.reviewNote}</p>}
        </section>
      ) : (
        <section className="card mt-6">
          <h2 className="text-lg font-semibold text-text-primary">Decision</h2>
          <label className="mt-3 block text-xs uppercase tracking-wide text-text-secondary" htmlFor="note">
            Note (required for rejection or requesting more information)
          </label>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="field-input mt-1 w-full"
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => handleReview("VERIFIED")}
              disabled={submitting !== null}
              className="btn-primary"
            >
              {submitting === "VERIFIED" ? "Approving…" : "Approve"}
            </button>
            <button
              type="button"
              onClick={() => handleReview("NEEDS_INFORMATION")}
              disabled={submitting !== null}
              className="btn-secondary"
            >
              {submitting === "NEEDS_INFORMATION" ? "Sending…" : "Request more information"}
            </button>
            <button
              type="button"
              onClick={() => handleReview("REJECTED")}
              disabled={submitting !== null}
              className="btn-tertiary text-danger"
            >
              {submitting === "REJECTED" ? "Rejecting…" : "Reject"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

export default function AdminKycDetailPage() {
  return (
    <RequirePlatformAdmin>
      <AdminKycDetailContent />
    </RequirePlatformAdmin>
  );
}
