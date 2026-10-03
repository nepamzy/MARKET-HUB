"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FormAlert } from "@/components/FormAlert";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useAuthedFetch } from "@/lib/use-authed-fetch";

interface ResolvedInvite {
  organizationId: string;
  organizationName: string;
}

/**
 * This page deliberately does NOT sit behind RequireAuth — an unauthenticated
 * visitor must be able to see which business the link is for (Section 3 of
 * the Phase 1 spec) before signing in. It never receives, stores, or infers
 * any business data beyond the organization's name: resolution is a public,
 * non-mutating GET, and actually gaining access is a separate, authenticated
 * POST that the backend re-validates from scratch (see invitations.service.ts).
 */
export default function InviteTokenPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const authedFetch = useAuthedFetch();

  const [invite, setInvite] = useState<ResolvedInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [outcome, setOutcome] = useState<"PENDING" | "APPROVED" | null>(null);

  useEffect(() => {
    apiFetch<ResolvedInvite>(`/invites/${params.token}`)
      .then(setInvite)
      .catch(() => setError("This invite link is invalid or has expired."));
  }, [params.token]);

  async function handleAccept() {
    setError(null);
    setAccepting(true);
    try {
      const res = await authedFetch<{ status: "PENDING" | "APPROVED" }>(`/invites/${params.token}/accept`, {
        method: "POST",
      });
      setOutcome(res.status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not process this invite.");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-navy">MARKET HUB</h1>

        {error && (
          <div className="mt-4">
            <FormAlert>{error}</FormAlert>
          </div>
        )}

        {!invite && !error && <p className="mt-4 text-sm text-text-secondary">Checking this invite…</p>}

        {invite && !outcome && (
          <>
            <p className="mt-4 text-sm text-text-secondary">You&apos;ve been invited to join</p>
            <p className="mt-1 text-xl font-semibold text-text-primary">{invite.organizationName}</p>

            {authLoading ? (
              <p className="mt-6 text-sm text-text-secondary">Loading…</p>
            ) : user ? (
              <button type="button" onClick={handleAccept} disabled={accepting} className="btn-primary mt-6 w-full">
                {accepting ? "Processing…" : "Request to join"}
              </button>
            ) : (
              <div className="mt-6 space-y-2">
                <Link
                  href={`/login?redirect=/invites/${params.token}`}
                  className="btn-primary block w-full text-center"
                >
                  Sign in to continue
                </Link>
                <Link
                  href="/register"
                  className="btn-secondary block w-full text-center"
                >
                  Create an account
                </Link>
              </div>
            )}
          </>
        )}

        {outcome === "APPROVED" && (
          <>
            <div className="mt-4">
              <FormAlert tone="success">You&apos;ve joined {invite?.organizationName}.</FormAlert>
            </div>
            <button type="button" onClick={() => router.push("/dashboard")} className="btn-primary mt-4 w-full">
              Go to dashboard
            </button>
          </>
        )}

        {outcome === "PENDING" && (
          <>
            <div className="mt-4">
              <FormAlert tone="success">
                Your request to join {invite?.organizationName} has been sent. You&apos;ll get access once an
                administrator approves it.
              </FormAlert>
            </div>
            <button type="button" onClick={() => router.push("/dashboard")} className="btn-secondary mt-4 w-full">
              Go to dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
