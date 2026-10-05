"use client";

import { useCallback, useEffect, useState } from "react";
import { RequirePlatformAdmin } from "@/components/RequirePlatformAdmin";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { AdminAuditLogEntry } from "@/lib/types";

function AuditContent() {
  const authedFetch = useAuthedFetch();
  const [entries, setEntries] = useState<AdminAuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ pageSize: "50" });
      if (actionFilter) query.set("action", actionFilter);
      const res = await authedFetch<{ entries: AdminAuditLogEntry[] }>(`/admin/audit-log?${query.toString()}`);
      setEntries(res.entries);
    } catch {
      setError("Could not load the audit log.");
    }
  }, [actionFilter, authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Audit log</h1>
      <p className="mt-1 text-sm text-text-secondary">
        The platform-wide security trail — every sensitive action, who performed it, and when. This is the real,
        persisted log; nothing here is sampled or synthesized.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label htmlFor="actionFilter" className="text-sm text-text-secondary">
          Filter by action
        </label>
        <input
          id="actionFilter"
          className="field-input w-auto"
          placeholder="e.g. ORGANIZATION_VERIFICATION_UPDATED"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        />
      </div>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      {entries === null && !error && <p className="mt-6 text-sm text-text-secondary">Loading…</p>}

      {entries && entries.length === 0 && (
        <div className="mt-6 rounded-control border border-dashed border-border p-8 text-center">
          <p className="text-sm text-text-secondary">No audit entries match.</p>
        </div>
      )}

      {entries && entries.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Organization</th>
                <th className="px-4 py-3 font-medium">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-text-secondary">{new Date(entry.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 font-medium text-text-primary">{entry.action}</td>
                  <td className="px-4 py-3 text-text-secondary">{entry.actor ? `${entry.actor.name} (${entry.actor.email})` : "—"}</td>
                  <td className="px-4 py-3 text-text-secondary">{entry.organization?.legalName ?? "—"}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {entry.targetType ? `${entry.targetType} ${entry.targetId ?? ""}` : "—"}
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

export default function AdminAuditPage() {
  return (
    <RequirePlatformAdmin>
      <AuditContent />
    </RequirePlatformAdmin>
  );
}
