"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { OrganizationWithRole, ProductUnitValue } from "@/lib/types";

/**
 * Catalogue/supplier → procurement handoff. Requisitions are org-scoped and
 * there is no global "active organization" concept, so when the viewer
 * belongs to more than one organization we ask which one before deep-linking
 * into its requisitions screen with the item prefilled.
 */
export function RequestQuotationButton({
  itemName = "",
  unit = "PIECE",
  supplierName,
  label = "Request a quotation",
}: {
  itemName?: string;
  unit?: ProductUnitValue;
  supplierName?: string;
  label?: string;
}) {
  const router = useRouter();
  const authedFetch = useAuthedFetch();
  const [organizations, setOrganizations] = useState<OrganizationWithRole[] | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function goTo(organizationId: string) {
    const params = new URLSearchParams();
    if (itemName) params.set("item", itemName);
    if (unit) params.set("unit", unit);
    if (supplierName) params.set("supplier", supplierName);
    router.push(`/organizations/${organizationId}/requisitions?${params.toString()}`);
  }

  async function handleClick() {
    if (organizations) return; // picker already open, "Continue" handles navigation
    setError(null);
    setLoading(true);
    try {
      const res = await authedFetch<{ organizations: OrganizationWithRole[] }>("/users/me/organizations");
      if (res.organizations.length === 0) {
        setError("You need an organization before you can request a quotation.");
      } else if (res.organizations.length === 1) {
        goTo(res.organizations[0].id);
      } else {
        setOrganizations(res.organizations);
        setSelectedOrgId(res.organizations[0].id);
      }
    } catch {
      setError("Could not start a quotation request right now.");
    } finally {
      setLoading(false);
    }
  }

  if (organizations) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="field-input w-auto"
          value={selectedOrgId}
          onChange={(e) => setSelectedOrgId(e.target.value)}
        >
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.legalName}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => goTo(selectedOrgId)} className="btn-primary">
          Continue
        </button>
      </div>
    );
  }

  return (
    <div>
      <button type="button" onClick={handleClick} disabled={loading} className="btn-secondary">
        {loading ? "Loading…" : label}
      </button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
