"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { FormAlert } from "@/components/FormAlert";
import { ApiError } from "@/lib/api";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { SupplierCapabilityValue, SupplierProfile } from "@/lib/types";

const CAPABILITIES: SupplierCapabilityValue[] = [
  "MANUFACTURER",
  "DISTRIBUTOR",
  "WHOLESALER",
  "RETAILER",
  "SERVICE_PROVIDER",
  "OTHER",
];

function toCsv(items: string[]) {
  return items.join(", ");
}
function fromCsv(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function SupplierProfileContent() {
  const params = useParams<{ id: string }>();
  const organizationId = params.id;
  const authedFetch = useAuthedFetch();

  const [, setProfile] = useState<SupplierProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [capabilities, setCapabilities] = useState<SupplierCapabilityValue[]>([]);
  const [categories, setCategories] = useState("");
  const [countriesServed, setCountriesServed] = useState("");
  const [regionsServed, setRegionsServed] = useState("");
  const [citiesServed, setCitiesServed] = useState("");
  const [minimumOrderInfo, setMinimumOrderInfo] = useState("");
  const [isDiscoverable, setIsDiscoverable] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch<SupplierProfile | null>(`/organizations/${organizationId}/supplier-profile`);
      setProfile(res);
      if (res) {
        setCapabilities(res.capabilities);
        setCategories(toCsv(res.categories));
        setCountriesServed(toCsv(res.countriesServed));
        setRegionsServed(toCsv(res.regionsServed));
        setCitiesServed(toCsv(res.citiesServed));
        setMinimumOrderInfo(res.minimumOrderInfo ?? "");
        setIsDiscoverable(res.isDiscoverable);
      }
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 403
          ? "You do not have access to this business."
          : "Could not load the supplier profile."
      );
    } finally {
      setLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleCapability(cap: SupplierCapabilityValue) {
    setCapabilities((prev) => (prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]));
    setSaved(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setSaving(true);
    try {
      await authedFetch(`/organizations/${organizationId}/supplier-profile`, {
        method: "PUT",
        body: JSON.stringify({
          capabilities,
          categories: fromCsv(categories),
          countriesServed: fromCsv(countriesServed),
          regionsServed: fromCsv(regionsServed),
          citiesServed: fromCsv(citiesServed),
          minimumOrderInfo,
          isDiscoverable,
        }),
      });
      setSaved(true);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not save the supplier profile.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!loaded) return <p className="text-sm text-text-secondary">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Supplier profile</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Configure how your business appears to buyers in the Market Hub directory. This is separate from your
        business profile and verification status.
      </p>

      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}

      <form onSubmit={handleSave} className="card mt-6">
        <fieldset>
          <legend className="text-xs uppercase tracking-wide text-text-secondary">Supplier capabilities</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {CAPABILITIES.map((cap) => (
              <button
                key={cap}
                type="button"
                onClick={() => toggleCapability(cap)}
                className={
                  capabilities.includes(cap)
                    ? "rounded-control border border-navy bg-navy/10 px-3 py-1.5 text-sm font-medium text-navy"
                    : "rounded-control border border-border px-3 py-1.5 text-sm text-text-secondary"
                }
              >
                {cap.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs uppercase tracking-wide text-text-secondary" htmlFor="categories">
              Categories (comma-separated)
            </label>
            <input
              id="categories"
              className="field-input mt-1"
              value={categories}
              onChange={(e) => {
                setCategories(e.target.value);
                setSaved(false);
              }}
              placeholder="beverages, packaged foods"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-text-secondary" htmlFor="countriesServed">
              Countries served
            </label>
            <input
              id="countriesServed"
              className="field-input mt-1"
              value={countriesServed}
              onChange={(e) => {
                setCountriesServed(e.target.value);
                setSaved(false);
              }}
              placeholder="Nigeria, Kenya, Ghana"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-text-secondary" htmlFor="regionsServed">
              Regions/states served
            </label>
            <input
              id="regionsServed"
              className="field-input mt-1"
              value={regionsServed}
              onChange={(e) => {
                setRegionsServed(e.target.value);
                setSaved(false);
              }}
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-text-secondary" htmlFor="citiesServed">
              Cities served
            </label>
            <input
              id="citiesServed"
              className="field-input mt-1"
              value={citiesServed}
              onChange={(e) => {
                setCitiesServed(e.target.value);
                setSaved(false);
              }}
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-text-secondary" htmlFor="minimumOrderInfo">
              Minimum order info (optional)
            </label>
            <input
              id="minimumOrderInfo"
              className="field-input mt-1"
              value={minimumOrderInfo}
              onChange={(e) => {
                setMinimumOrderInfo(e.target.value);
                setSaved(false);
              }}
              placeholder="e.g. 50 units minimum per order"
            />
          </div>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={isDiscoverable}
            onChange={(e) => {
              setIsDiscoverable(e.target.checked);
              setSaved(false);
            }}
          />
          Visible in the business directory
        </label>
        <p className="mt-1 text-xs text-text-secondary">
          When off, your business will not appear in buyer search results, even if this profile is otherwise
          complete.
        </p>

        <div className="mt-4">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving…" : "Save supplier profile"}
          </button>
          {saved && <span className="ml-3 text-sm text-success">Saved.</span>}
        </div>
      </form>
    </div>
  );
}

export default function SupplierProfilePage() {
  return (
    <RequireAuth>
      <SupplierProfileContent />
    </RequireAuth>
  );
}
