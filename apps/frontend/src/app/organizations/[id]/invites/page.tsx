"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { FormAlert } from "@/components/FormAlert";
import { ApiError } from "@/lib/api";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { InviteLink, JoinRequest } from "@/lib/types";
import type { MembershipRole } from "@market-hub/shared";

function InvitesContent() {
  const params = useParams<{ id: string }>();
  const organizationId = params.id;
  const authedFetch = useAuthedFetch();

  const [links, setLinks] = useState<InviteLink[] | null>(null);
  const [requests, setRequests] = useState<JoinRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const [inviteeEmail, setInviteeEmail] = useState("");
  const [role, setRole] = useState<Extract<MembershipRole, "STAFF" | "MANAGER">>("STAFF");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [linksRes, requestsRes] = await Promise.all([
        authedFetch<InviteLink[]>(`/organizations/${organizationId}/invite-links`),
        authedFetch<JoinRequest[]>(`/organizations/${organizationId}/join-requests?status=PENDING`),
      ]);
      setLinks(linksRes);
      setRequests(requestsRes);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 403
          ? "You do not have access to manage invites for this business."
          : "Could not load invites and join requests."
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreateLink(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setCreating(true);
    try {
      const body: Record<string, unknown> = { expiresInDays: 7 };
      if (inviteeEmail.trim()) {
        body.inviteeEmail = inviteeEmail.trim();
        body.role = role;
      }
      const res = await authedFetch<InviteLink & { token: string }>(
        `/organizations/${organizationId}/invite-links`,
        { method: "POST", body: JSON.stringify(body) }
      );
      setCreatedToken(res.token);
      setInviteeEmail("");
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not create the invite.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(linkId: string) {
    setActionError(null);
    try {
      await authedFetch(`/organizations/${organizationId}/invite-links/${linkId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not revoke this link.");
    }
  }

  async function handleReview(requestId: string, status: "APPROVED" | "REJECTED") {
    setActionError(null);
    try {
      await authedFetch(`/organizations/${organizationId}/join-requests/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not update this request.");
    }
  }

  if (error) {
    return <p className="text-sm text-danger">{error}</p>;
  }

  if (!links || !requests) {
    return <p className="text-sm text-text-secondary">Loading…</p>;
  }

  const inviteUrlBase = typeof window !== "undefined" ? `${window.location.origin}/invites/` : "/invites/";

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Invites &amp; join requests</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Share a link so people can request to join, or invite someone directly by email with a specific role.
        Opening a link never grants access by itself — every new member still requires your approval, or is
        pre-approved only when you invited that exact person.
      </p>

      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}

      <section className="card mt-6">
        <h2 className="text-lg font-semibold text-text-primary">Create an invite</h2>
        <form onSubmit={handleCreateLink} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="text-xs uppercase tracking-wide text-text-secondary" htmlFor="inviteeEmail">
              Email (optional — leave blank for a shareable link)
            </label>
            <input
              id="inviteeEmail"
              type="email"
              value={inviteeEmail}
              onChange={(e) => setInviteeEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="field-input mt-1"
            />
          </div>
          {inviteeEmail.trim() && (
            <div>
              <label className="text-xs uppercase tracking-wide text-text-secondary" htmlFor="role">
                Role
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
                className="field-input mt-1"
              >
                <option value="STAFF">Staff</option>
                <option value="MANAGER">Manager</option>
              </select>
            </div>
          )}
          <button type="submit" disabled={creating} className="btn-primary">
            {creating ? "Creating…" : inviteeEmail.trim() ? "Send invitation" : "Create link"}
          </button>
        </form>

        {createdToken && (
          <div className="mt-4 rounded-card border border-success/30 bg-success/5 px-4 py-3 text-sm">
            <p className="text-text-primary">Share this link — it will only be shown once:</p>
            <code className="mt-1 block break-all text-xs text-text-secondary">
              {inviteUrlBase}
              {createdToken}
            </code>
          </div>
        )}
      </section>

      <section className="card mt-6">
        <h2 className="text-lg font-semibold text-text-primary">Pending join requests</h2>
        {requests.length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">No pending requests right now.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-text-primary">{r.user.name}</p>
                  <p className="text-xs text-text-secondary">{r.user.email}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleReview(r.id, "APPROVED")} className="btn-primary">
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReview(r.id, "REJECTED")}
                    className="btn-secondary"
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mt-6">
        <h2 className="text-lg font-semibold text-text-primary">Active links</h2>
        {links.filter((l) => !l.revokedAt).length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">No active invites.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {links
              .filter((l) => !l.revokedAt)
              .map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {l.inviteeEmail ? `Direct invite — ${l.inviteeEmail} (${l.role})` : "Shareable link"}
                    </p>
                    <p className="text-xs text-text-secondary">
                      Expires {new Date(l.expiresAt).toLocaleDateString()} · used {l.useCount}
                      {l.maxUses ? ` / ${l.maxUses}` : ""} time{l.useCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button type="button" onClick={() => handleRevoke(l.id)} className="btn-tertiary text-sm text-danger">
                    Revoke
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function InvitesPage() {
  return (
    <RequireAuth>
      <InvitesContent />
    </RequireAuth>
  );
}
