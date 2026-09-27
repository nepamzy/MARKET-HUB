"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { FormAlert } from "@/components/FormAlert";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { Category, OrganizationProduct, PriceTierValue, ProductUnitValue } from "@/lib/types";

const UNITS: ProductUnitValue[] = [
  "PIECE", "PACK", "CARTON", "BOX", "KILOGRAM", "GRAM", "LITRE", "MILLILITRE", "METRE", "CASE", "OTHER",
];
const TIERS: PriceTierValue[] = ["RETAIL", "WHOLESALE", "BUSINESS"];

interface FormState {
  name: string;
  description: string;
  sku: string;
  categoryId: string;
  brand: string;
  unit: ProductUnitValue;
  minimumOrderQuantity: string;
  priceTier: PriceTierValue;
  priceAmount: string;
  priceCurrency: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  sku: "",
  categoryId: "",
  brand: "",
  unit: "PIECE",
  minimumOrderQuantity: "",
  priceTier: "RETAIL",
  priceAmount: "",
  priceCurrency: "NGN",
};

function ProductsContent() {
  const params = useParams<{ id: string }>();
  const organizationId = params.id;
  const authedFetch = useAuthedFetch();

  const [products, setProducts] = useState<OrganizationProduct[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null); // "new" or a product id
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        authedFetch<{ products: OrganizationProduct[] }>(`/organizations/${organizationId}/products`),
        authedFetch<Category[]>("/categories"),
      ]);
      setProducts(productsRes.products);
      setCategories(categoriesRes);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 403
          ? "You do not have access to this business."
          : "Could not load products."
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  function startCreate() {
    setForm(EMPTY_FORM);
    setEditingId("new");
    setActionError(null);
  }

  function startEdit(p: OrganizationProduct) {
    setForm({
      name: p.name,
      description: p.description ?? "",
      sku: p.sku ?? "",
      categoryId: p.categoryId ?? "",
      brand: p.brand ?? "",
      unit: p.unit,
      minimumOrderQuantity: p.minimumOrderQuantity?.toString() ?? "",
      priceTier: p.prices[0]?.tier ?? "RETAIL",
      priceAmount: p.prices[0]?.unitPrice?.toString() ?? "",
      priceCurrency: p.prices[0]?.currency ?? "NGN",
    });
    setEditingId(p.id);
    setActionError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        sku: form.sku || undefined,
        categoryId: form.categoryId || undefined,
        brand: form.brand || undefined,
        unit: form.unit,
        minimumOrderQuantity: form.minimumOrderQuantity ? Number(form.minimumOrderQuantity) : undefined,
        prices: form.priceAmount
          ? [{ tier: form.priceTier, unitPrice: Number(form.priceAmount), currency: form.priceCurrency, minQuantity: 1 }]
          : undefined,
      };
      if (editingId === "new") {
        await authedFetch(`/organizations/${organizationId}/products`, { method: "POST", body: JSON.stringify(payload) });
      } else {
        await authedFetch(`/organizations/${organizationId}/products/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      setEditingId(null);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not save this product.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(productId: string, status: string, isDiscoverable?: boolean) {
    setActionError(null);
    try {
      await authedFetch(`/organizations/${organizationId}/products/${productId}`, {
        method: "PATCH",
        body: JSON.stringify(isDiscoverable === undefined ? { status } : { status, isDiscoverable }),
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not update this product.");
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!products) return <p className="text-sm text-text-secondary">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-navy">Products</h1>
        <button type="button" onClick={startCreate} className="btn-primary">
          New product
        </button>
      </div>

      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}

      {editingId && (
        <form onSubmit={handleSubmit} className="card mt-6">
          <h2 className="text-lg font-semibold text-text-primary">
            {editingId === "new" ? "New product" : "Edit product"}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs uppercase tracking-wide text-text-secondary">Name *</label>
              <input
                required
                className="field-input mt-1"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs uppercase tracking-wide text-text-secondary">Description</label>
              <textarea
                rows={2}
                className="field-input mt-1 w-full"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-text-secondary">SKU</label>
              <input
                className="field-input mt-1"
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-text-secondary">Brand</label>
              <input
                className="field-input mt-1"
                value={form.brand}
                onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-text-secondary">Category</label>
              <select
                className="field-input mt-1"
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-text-secondary">Unit</label>
              <select
                className="field-input mt-1"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value as ProductUnitValue }))}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-text-secondary">Minimum order quantity</label>
              <input
                type="number"
                min={1}
                className="field-input mt-1"
                value={form.minimumOrderQuantity}
                onChange={(e) => setForm((f) => ({ ...f, minimumOrderQuantity: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-text-secondary">Price tier</label>
              <select
                className="field-input mt-1"
                value={form.priceTier}
                onChange={(e) => setForm((f) => ({ ...f, priceTier: e.target.value as PriceTierValue }))}
              >
                {TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs uppercase tracking-wide text-text-secondary">Price</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="field-input mt-1"
                  value={form.priceAmount}
                  onChange={(e) => setForm((f) => ({ ...f, priceAmount: e.target.value }))}
                />
              </div>
              <div className="w-24">
                <label className="text-xs uppercase tracking-wide text-text-secondary">Currency</label>
                <input
                  maxLength={3}
                  className="field-input mt-1 uppercase"
                  value={form.priceCurrency}
                  onChange={(e) => setForm((f) => ({ ...f, priceCurrency: e.target.value.toUpperCase() }))}
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setEditingId(null)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {products.length === 0 ? (
        <p className="mt-6 text-sm text-text-secondary">No products yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Visibility</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium text-text-primary">{p.name}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.isDiscoverable ? "ACTIVE" : "SUSPENDED"} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-3">
                      <button type="button" onClick={() => startEdit(p)} className="btn-tertiary px-0 text-sm">
                        Edit
                      </button>
                      {p.status === "DRAFT" && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(p.id, "ACTIVE", true)}
                          className="btn-tertiary px-0 text-sm"
                        >
                          Activate
                        </button>
                      )}
                      {p.status === "ACTIVE" && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(p.id, "INACTIVE")}
                          className="btn-tertiary px-0 text-sm"
                        >
                          Deactivate
                        </button>
                      )}
                      {p.status !== "ARCHIVED" && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(p.id, "ARCHIVED")}
                          className="btn-tertiary px-0 text-sm text-danger"
                        >
                          Archive
                        </button>
                      )}
                    </div>
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

export default function OrganizationProductsPage() {
  return (
    <RequireAuth>
      <ProductsContent />
    </RequireAuth>
  );
}
