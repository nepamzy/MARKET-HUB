"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { FormAlert } from "@/components/FormAlert";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { formatMinorUnits } from "@/lib/money";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { CartView, PublicProduct } from "@/lib/types";

function ProductDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const authedFetch = useAuthedFetch();
  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setProduct(await authedFetch<PublicProduct>(`/products/${params.id}`));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "This product is not currently available."
          : "Could not load this product."
      );
    }
  }, [params.id, authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddToCart() {
    if (!product) return;
    setAddError(null);
    setAdding(true);
    try {
      await authedFetch<CartView>("/cart/items", {
        method: "POST",
        body: JSON.stringify({ productId: product.id, quantity }),
      });
      router.push("/cart");
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "Could not add this item to your cart.");
    } finally {
      setAdding(false);
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!product) return <p className="text-sm text-text-secondary">Loading…</p>;

  const isAvailable = (product.commercialOffer?.availability ?? "AVAILABLE") === "AVAILABLE";

  return (
    <div>
      <Link href="/marketplace" className="text-sm text-text-secondary hover:text-navy">
        ← Back to marketplace
      </Link>

      <div className="mt-3 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy">{product.name}</h1>
        <StatusBadge status={product.commercialOffer?.availability ?? "AVAILABLE"} />
      </div>
      {product.brand && <p className="mt-1 text-sm text-text-secondary">{product.brand}</p>}
      {product.description && <p className="card mt-6 text-sm text-text-primary">{product.description}</p>}

      {product.commercialOffer && (product.commercialOffer.leadTimeDays || product.commercialOffer.leadTimeNote) && (
        <p className="mt-4 text-sm text-text-secondary">
          {product.commercialOffer.leadTimeNote ??
            `Lead time: ${product.commercialOffer.leadTimeDays} day${product.commercialOffer.leadTimeDays === 1 ? "" : "s"}`}
        </p>
      )}

      {product.prices.length > 0 && (
        <section className="card mt-6">
          <h2 className="text-lg font-semibold text-text-primary">Pricing</h2>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-2 font-medium">Tier</th>
                <th className="py-2 font-medium">Min. quantity</th>
                <th className="py-2 font-medium">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {product.prices.map((price, i) => (
                <tr key={i}>
                  <td className="py-2">{price.tier}</td>
                  <td className="py-2">
                    {price.minQuantity} {product.unit.toLowerCase()}
                    {price.minQuantity !== 1 ? "s" : ""}
                  </td>
                  <td className="py-2 font-medium text-navy">
                    {formatMinorUnits(price.unitPriceMinor, price.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(product.minimumOrderQuantity || product.commercialOffer?.maxQuantity || product.commercialOffer?.orderIncrement) && (
            <p className="mt-3 text-xs text-text-secondary">
              {product.minimumOrderQuantity && `Minimum order: ${product.minimumOrderQuantity} ${product.unit.toLowerCase()}. `}
              {product.commercialOffer?.maxQuantity && `Maximum order: ${product.commercialOffer.maxQuantity} ${product.unit.toLowerCase()}. `}
              {product.commercialOffer?.orderIncrement &&
                `Order in multiples of ${product.commercialOffer.orderIncrement} ${product.unit.toLowerCase()}.`}
            </p>
          )}
        </section>
      )}

      <section className="card mt-6">
        {addError && (
          <div className="mb-4">
            <FormAlert>{addError}</FormAlert>
          </div>
        )}
        {isAvailable ? (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="quantity" className="field-label">
                Quantity ({product.unit.toLowerCase()})
              </label>
              <input
                id="quantity"
                type="number"
                min={product.minimumOrderQuantity ?? 1}
                step={product.commercialOffer?.orderIncrement ?? 1}
                className="field-input w-28"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
              />
            </div>
            <button type="button" onClick={handleAddToCart} disabled={adding} className="btn-primary">
              {adding ? "Adding…" : "Add to cart"}
            </button>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">This product is not currently available for purchase.</p>
        )}
      </section>

      <section className="card mt-6">
        <h2 className="text-lg font-semibold text-text-primary">Supplied by</h2>
        <div className="mt-2 flex items-center gap-3">
          <p className="font-medium text-text-primary">{product.organization.legalName}</p>
          <StatusBadge status={product.organization.verificationStatus} />
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          {product.organization.city ? `${product.organization.city}, ` : ""}
          {product.organization.country ?? "Location not specified"}
        </p>
        <Link href={`/directory/${product.organization.id}`} className="btn-tertiary mt-3 px-0 text-sm">
          View business profile
        </Link>
      </section>
    </div>
  );
}

export default function ProductDetailPage() {
  return (
    <RequireAuth>
      <ProductDetailContent />
    </RequireAuth>
  );
}
