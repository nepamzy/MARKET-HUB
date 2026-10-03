"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { FormAlert } from "@/components/FormAlert";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { ProductUnitValue, RequisitionView } from "@/lib/types";

const UNITS: ProductUnitValue[] = ["PIECE", "PACK", "CARTON", "BOX", "KILOGRAM", "GRAM", "LITRE", "MILLILITRE", "METRE", "CASE", "OTHER"];

interface ItemDraft {
  itemName: string;
  quantity: number;
  unit: ProductUnitValue;
  specification: string;
}

function emptyItem(): ItemDraft {
  return { itemName: "", quantity: 1, unit: "PIECE", specification: "" };
}

function RequisitionsContent() {
  const params = useParams<{ id: string }>();
  const authedFetch = useAuthedFetch();
  const [requisitions, setRequisitions] = useState<RequisitionView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch<{ requisitions: RequisitionView[] }>(`/organizations/${params.id}/requisitions`);
      setRequisitions(res.requisitions);
    } catch {
      setError("Could not load requisitions for this organization.");
    }
  }, [params.id, authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await authedFetch(`/organizations/${params.id}/requisitions`, {
        method: "POST",
        body: JSON.stringify({
          title,
          items: items.map((item) => ({
            itemName: item.itemName,
            quantity: Number(item.quantity),
            unit: item.unit,
            specification: item.specification || undefined,
          })),
        }),
      });
      setTitle("");
      setItems([emptyItem()]);
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create the requisition.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Requisitions</h1>
          <p className="mt-1 text-sm text-text-secondary">Internal procurement needs for this organization.</p>
        </div>
        <button type="button" onClick={() => setShowForm((v) => !v)} className="btn-primary">
          {showForm ? "Cancel" : "New requisition"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card mt-6 space-y-4">
          {formError && <FormAlert>{formError}</FormAlert>}
          <div>
            <label htmlFor="title" className="field-label">
              Title
            </label>
            <input
              id="title"
              required
              className="field-input mt-1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Quarterly raw material restock"
            />
          </div>

          <div>
            <p className="field-label">Items</p>
            <div className="mt-2 space-y-3">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 rounded-control border border-border p-3 sm:grid-cols-12">
                  <input
                    required
                    placeholder="Item name"
                    className="field-input sm:col-span-5"
                    value={item.itemName}
                    onChange={(e) => updateItem(i, { itemName: e.target.value })}
                  />
                  <input
                    required
                    type="number"
                    min={1}
                    placeholder="Qty"
                    className="field-input sm:col-span-2"
                    value={item.quantity}
                    onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                  />
                  <select
                    className="field-input sm:col-span-2"
                    value={item.unit}
                    onChange={(e) => updateItem(i, { unit: e.target.value as ProductUnitValue })}
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Specification (optional)"
                    className="field-input sm:col-span-2"
                    value={item.specification}
                    onChange={(e) => updateItem(i, { specification: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                    disabled={items.length === 1}
                    className="btn-tertiary text-sm text-danger sm:col-span-1"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setItems((prev) => [...prev, emptyItem()])} className="btn-secondary mt-3">
              Add item
            </button>
          </div>

          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? "Creating…" : "Create draft requisition"}
          </button>
        </form>
      )}

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      {requisitions === null && !error && <p className="mt-6 text-sm text-text-secondary">Loading…</p>}

      {requisitions && requisitions.length === 0 && (
        <div className="mt-6 rounded-control border border-dashed border-border p-8 text-center">
          <p className="text-sm text-text-secondary">No requisitions yet.</p>
        </div>
      )}

      {requisitions && requisitions.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {requisitions.map((req) => (
                <tr key={req.id} className="hover:bg-background">
                  <td className="px-4 py-3">
                    <Link
                      href={`/organizations/${params.id}/requisitions/${req.id}`}
                      className="font-medium text-text-primary hover:text-green-dark"
                    >
                      {req.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{req.title}</td>
                  <td className="px-4 py-3 text-text-secondary">{req.items.length}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={req.status} />
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{new Date(req.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function RequisitionsPage() {
  return (
    <RequireAuth>
      <RequisitionsContent />
    </RequireAuth>
  );
}
