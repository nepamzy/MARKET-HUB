"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { FormAlert } from "@/components/FormAlert";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { Member } from "@/lib/types";
import type { MembershipRole } from "@market-hub/shared";

const ASSIGNABLE_ROLES: Exclude<MembershipRole, "OWNER">[] = ["STAFF", "MANAGER"];

function MembersContent() {
  const params = useParams<{ id: string }>();
  const organizationId = params.id;
  const authedFetch = useAuthedFetch();

  const [members, setMembers] = useState<Member[] | null>(null);
  const [myRole, setMyRole] = useState<MembershipRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<Exclude<MembershipRole, "OWNER">>("STAFF");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const [membersRes, orgRes] = await Promise.all([
        authedFetch<{ members: Member[] }>(`/organizations/${organizationId}/members`),
        authedFetch<{ membershipRole: MembershipRole }>(`/organizations/${organizationId}`),
      ]);
      setMembers(membersRes.members);
      setMyRole(orgRes.membershipRole);
    } catch {
      setError("Could not load members for this organization.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddMember(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setAdding(true);
    try {
      await authedFetch(`/organizations/${organizationId}/members`, {
        method: "POST",
        body: JSON.stringify({ email: newEmail, role: newRole }),
      });
      setNewEmail("");
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not add that member.");
    } finally {
      setAdding(false);
    }
  }

  async function handleRoleChange(userId: string, role: Exclude<MembershipRole, "OWNER">) {
    setActionError(null);
    try {
      await authedFetch(`/organizations/${organizationId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not update that member's role.");
    }
  }

  async function handleRemove(userId: string) {
    setActionError(null);
    try {
      await authedFetch(`/organizations/${organizationId}/members/${userId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not remove that member.");
    }
  }

  if (error) {
    return <p className="text-sm text-danger">{error}</p>;
  }

  if (!members) {
    return <p className="text-sm text-text-secondary">Loading…</p>;
  }

  const canManage = myRole === "OWNER";
  const canAdd = myRole === "OWNER" || myRole === "MANAGER";

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Members</h1>
      <p className="mt-1 text-sm text-text-secondary">People who can access this organization.</p>

      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              {canManage && <th className="px-4 py-3 font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.map((member) => (
              <tr key={member.id}>
                <td className="px-4 py-3 font-medium text-text-primary">{member.user.name}</td>
                <td className="px-4 py-3 text-text-secondary">{member.user.email}</td>
                <td className="px-4 py-3">
                  {canManage && member.role !== "OWNER" ? (
                    <select
                      className="field-input py-1.5 text-sm"
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.user.id, e.target.value as Exclude<MembershipRole, "OWNER">)}
                    >
                      {ASSIGNABLE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <StatusBadge status={member.role} />
                  )}
                </td>
                {canManage && (
                  <td className="px-4 py-3">
                    {member.role !== "OWNER" && (
                      <button
                        type="button"
                        onClick={() => handleRemove(member.user.id)}
                        className="btn-tertiary px-0 text-sm text-danger"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canAdd && (
        <form onSubmit={handleAddMember} className="card mt-6 max-w-lg">
          <h2 className="text-sm font-semibold text-text-primary">Add a member</h2>
          <p className="mt-1 text-xs text-text-secondary">
            They must already have a MARKET HUB account.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              required
              placeholder="Email address"
              className="field-input"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
            <select
              className="field-input sm:w-40"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Exclude<MembershipRole, "OWNER">)}
            >
              {ASSIGNABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button type="submit" disabled={adding} className="btn-primary sm:w-auto">
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function MembersPage() {
  return (
    <RequireAuth>
      <MembersContent />
    </RequireAuth>
  );
}
