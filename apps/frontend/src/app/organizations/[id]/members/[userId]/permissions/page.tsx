"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PERMISSION_RESOURCES, type PermissionLevel, type PermissionResource } from "@market-hub/shared";
import { RequireAuth } from "@/components/RequireAuth";
import { FormAlert } from "@/components/FormAlert";
import { ApiError } from "@/lib/api";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { MemberPermissions } from "@/lib/types";

const RESOURCE_LABELS: Record<PermissionResource, string> = {
  ORDERS: "Orders",
  INVENTORY: "Inventory",
  PROCUREMENT: "Procurement",
  PAYMENTS: "Payments",
  CATALOGUE: "Catalogue",
  CUSTOMERS: "Customers",
  KYC: "KYC & verification",
  MEMBERS: "Team members",
  SETTINGS: "Business settings",
};

const LEVEL_LABELS: Record<PermissionLevel, string> = {
  NONE: "No access",
  VIEW: "Can view",
  EDIT: "Can view & edit",
};

function PermissionsContent() {
  const params = useParams<{ id: string; userId: string }>();
  const { id: organizationId, userId } = params;
  const authedFetch = useAuthedFetch();

  const [data, setData] = useState<MemberPermissions | null>(null);
  const [pending, setPending] = useState<Partial<Record<PermissionResource, PermissionLevel>>>({});
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch<MemberPermissions>(
        `/organizations/${organizationId}/members/${userId}/permissions`
      );
      setData(res);
      setPending({});
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not load this member's permissions."
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  function handleChange(resource: PermissionResource, level: PermissionLevel) {
    setPending((prev) => ({ ...prev, [resource]: level }));
    setSaved(false);
  }

  async function handleSave() {
    if (Object.keys(pending).length === 0) return;
    setActionError(null);
    setSaving(true);
    try {
      const res = await authedFetch<MemberPermissions>(
        `/organizations/${organizationId}/members/${userId}/permissions`,
        { method: "PUT", body: JSON.stringify(pending) }
      );
      setData(res);
      setPending({});
      setSaved(true);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not save these permission changes."
      );
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return <p className="text-sm text-danger">{error}</p>;
  }

  if (!data) {
    return <p className="text-sm text-text-secondary">Loading…</p>;
  }

  const hasChanges = Object.keys(pending).length > 0;

  return (
    <div>
      <Link
        href={`/organizations/${organizationId}/members`}
        className="text-sm text-text-secondary hover:text-navy"
      >
        ← Back to members
      </Link>

      <h1 className="mt-3 text-2xl font-semibold text-navy">Member permissions</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Base role: <span className="font-medium text-text-primary">{data.role}</span>. Overrides
        below take priority over the role&apos;s defaults for each area.
      </p>

      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}
      {saved && !hasChanges && (
        <div className="mt-4 rounded-card border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          Permissions updated.
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th className="px-4 py-3 font-medium">Area</th>
              <th className="px-4 py-3 font-medium">Access</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {PERMISSION_RESOURCES.map((resource) => {
              const currentLevel = pending[resource] ?? data.permissions[resource];
              return (
                <tr key={resource}>
                  <td className="px-4 py-3 font-medium text-text-primary">
                    {RESOURCE_LABELS[resource]}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="field-input py-1.5 text-sm sm:w-48"
                      value={currentLevel}
                      onChange={(e) => handleChange(resource, e.target.value as PermissionLevel)}
                    >
                      {(["NONE", "VIEW", "EDIT"] as const).map((level) => (
                        <option key={level} value={level}>
                          {LEVEL_LABELS[level]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={!hasChanges || saving}
        className="btn-primary mt-6"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

export default function MemberPermissionsPage() {
  return (
    <RequireAuth>
      <PermissionsContent />
    </RequireAuth>
  );
}
