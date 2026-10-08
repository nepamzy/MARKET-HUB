"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { FormAlert } from "@/components/FormAlert";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { MembershipRole } from "@market-hub/shared";
import type { Organization, ProductInventoryDetail, StockMovementView } from "@/lib/types";

function MovementSign({ quantity }: { quantity: number }) {
  const positive = quantity > 0;
  return <span className={positive ? "text-success" : "text-danger"}>{positive ? `+${quantity}` : quantity}</span>;
}

function ProductInventoryDetailContent() {
  const params = useParams<{ id: string; productId: string }>();
  const organizationId = params.id;
  const productId = params.productId;
  const authedFetch = useAuthedFetch();

  const [detail, setDetail] = useState<ProductInventoryDetail | null>(null);
  const [movements, setMovements] = useState<StockMovementView[] | null>(null);
  const [membershipRole, setMembershipRole] = useState<MembershipRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [quantityChange, setQuantityChange] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [detailRes, movementsRes, orgRes] = await Promise.all([
        authedFetch<ProductInventoryDetail>(`/organizations/${organizationId}/products/${productId}/inventory`),
        authedFetch<{ movements: StockMovementView[] }>(
          `/organizations/${organizationId}/products/${productId}/inventory/movements`
        ),
        authedFetch<{ organization: Organization; membershipRole: MembershipRole }>(`/organizations/${organizationId}`),
      ]);
      setDetail(detailRes);
      setMovements(movementsRes.movements);
      setMembershipRole(orgRes.membershipRole);
    } catch (err) {
      setError(
        err instanceof ApiError && (err.status === 403 || err.status === 404)
          ? "You do not have access to this product."
          : "Could not load inventory for this product."
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, productId]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitAdjustment(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    const parsed = Number(quantityChange);
    if (!Number.isInteger(parsed) || parsed === 0) {
      setActionError("Enter a non-zero whole number.");
      return;
    }
    if (!reason.trim()) {
      setActionError("A reason is required for every stock adjustment.");
      return;
    }
    setSaving(true);
    try {
      await authedFetch(`/organizations/${organizationId}/products/${productId}/inventory/adjustments`, {
        method: "POST",
        body: JSON.stringify({ quantityChange: parsed, reason: reason.trim() }),
      });
      setQuantityChange("");
      setReason("");
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not apply this adjustment.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!detail || !movements) return <p className="text-sm text-text-secondary">Loading…</p>;

  const canAdjust = membershipRole === "OWNER" || membershipRole === "MANAGER";
  const inv = detail.inventory;

  return (
    <div className="max-w-4xl">
      <Link href={`/organizations/${organizationId}/inventory`} className="text-sm text-text-secondary hover:text-navy">
        ← Back to inventory
      </Link>

      <h1 className="mt-3 text-2xl font-semibold text-navy">{detail.product.name}</h1>

      {actionError && (
        <div className="mt-4">
          <FormAlert>{actionError}</FormAlert>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="text-sm font-semibold text-text-primary">Stock status</h2>
          {detail.tracked && inv ? (
            <dl className="mt-4 grid grid-cols-3 gap-4 text-center">
              <div>
                <dt className="text-xs uppercase tracking-wide text-text-secondary">On hand</dt>
                <dd className="mt-1 text-2xl font-semibold text-text-primary">{inv.onHand.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-text-secondary">Reserved</dt>
                <dd className="mt-1 text-2xl font-semibold text-text-primary">{inv.reserved.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-text-secondary">Available</dt>
                <dd className={`mt-1 text-2xl font-semibold ${inv.available <= 0 ? "text-danger" : "text-success"}`}>
                  {inv.available.toLocaleString()}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-text-secondary">
              This product is not stock-tracked — it sells with no quantity limit. Record an adjustment below to
              start tracking it.
            </p>
          )}
        </section>

        {canAdjust && (
          <section className="card">
            <h2 className="text-sm font-semibold text-text-primary">
              {detail.tracked ? "Adjust stock" : "Start tracking"}
            </h2>
            <form onSubmit={submitAdjustment} className="mt-3 space-y-3">
              <div>
                <label className="text-xs uppercase tracking-wide text-text-secondary">Quantity change</label>
                <input
                  type="number"
                  step={1}
                  required
                  className="field-input mt-1"
                  placeholder="e.g. 50 or -5"
                  value={quantityChange}
                  onChange={(e) => setQuantityChange(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-text-secondary">Reason</label>
                <input
                  required
                  className="field-input mt-1"
                  placeholder="e.g. Stock count correction"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <button type="submit" disabled={saving} className="btn-primary w-full">
                {saving ? "Saving…" : "Apply adjustment"}
              </button>
            </form>
          </section>
        )}
      </div>

      <section className="card mt-6">
        <h2 className="text-sm font-semibold text-text-primary">Movement history</h2>
        {movements.length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">No stock movements yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-secondary">
                  <th className="py-2 font-medium">Type</th>
                  <th className="py-2 font-medium text-right">Change</th>
                  <th className="py-2 font-medium">Reason / order</th>
                  <th className="py-2 font-medium">By</th>
                  <th className="py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2">
                      <StatusBadge status={m.type} />
                    </td>
                    <td className="py-2 text-right font-medium">
                      <MovementSign quantity={m.quantity} />
                    </td>
                    <td className="py-2 text-text-secondary">
                      {m.reason ?? (m.orderId ? `Order ${m.orderId.slice(0, 8)}` : "—")}
                    </td>
                    <td className="py-2 text-text-secondary">{m.actorUser?.name ?? "—"}</td>
                    <td className="py-2 text-text-secondary">{new Date(m.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default function ProductInventoryDetailPage() {
  return (
    <RequireAuth>
      <ProductInventoryDetailContent />
    </RequireAuth>
  );
}
