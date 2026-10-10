"use client";

import { useCallback, useEffect, useState } from "react";
import { RequirePlatformAdmin } from "@/components/RequirePlatformAdmin";
import { FormAlert } from "@/components/FormAlert";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { useAuthedFetch } from "@/lib/use-authed-fetch";

interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  platformRole: string;
  accountStatus: string;
  createdAt: string;
}

function UsersContent() {
  const authedFetch = useAuthedFetch();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch<{ users: AdminUserRow[] }>("/admin/users?pageSize=50");
      setUsers(res.users);
    } catch {
      setError("Could not load users.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleDriver(userId: string, isDriver: boolean) {
    setActionError(null);
    setBusyUserId(userId);
    try {
      await authedFetch(`/admin/users/${userId}/driver-role`, {
        method: "PATCH",
        body: JSON.stringify({ isDriver }),
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not change this user's driver role.");
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Users</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Every registered user on the platform. The only role change available here is granting or revoking DRIVER —
        explicit, server-side, and audited (Phase 12); it can never be used to grant PLATFORM_ADMIN.
      </p>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}
      {users === null && !error && <p className="mt-6 text-sm text-text-secondary">Loading…</p>}

      {users && users.length === 0 && (
        <div className="mt-6 rounded-control border border-dashed border-border p-8 text-center">
          <p className="text-sm text-text-secondary">No users yet.</p>
        </div>
      )}

      {users && users.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Platform role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium text-text-primary">{u.name}</td>
                  <td className="px-4 py-3 text-text-secondary">{u.email}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={u.platformRole} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={u.accountStatus} />
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    {u.platformRole !== "PLATFORM_ADMIN" && (
                      <button
                        type="button"
                        disabled={busyUserId === u.id}
                        onClick={() => toggleDriver(u.id, u.platformRole !== "DRIVER")}
                        className="btn-tertiary px-0 text-sm"
                      >
                        {u.platformRole === "DRIVER" ? "Remove driver role" : "Make driver"}
                      </button>
                    )}
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

export default function AdminUsersPage() {
  return (
    <RequirePlatformAdmin>
      <UsersContent />
    </RequirePlatformAdmin>
  );
}
