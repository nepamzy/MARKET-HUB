"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { FormAlert } from "@/components/FormAlert";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { formatMinorUnits } from "@/lib/money";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { PaymentView } from "@/lib/types";

/**
 * Where PAYSTACK_CALLBACK_URL sends the buyer's browser after the hosted
 * checkout page. This redirect is a UX convenience only — it proves
 * nothing about whether the payment succeeded (Rule: success must never
 * be determined from frontend redirect alone). The one thing this page
 * does is call the real server-side verify endpoint and show whatever it
 * actually reports; it never assumes success because the browser ended up
 * here. Paystack appends both `reference` and `trxref` (identical values)
 * to the callback URL — `reference` is read first since it matches our
 * own naming everywhere else.
 */
function PaymentCallbackContent() {
  const searchParams = useSearchParams();
  const authedFetch = useAuthedFetch();
  const reference = searchParams.get("reference") ?? searchParams.get("trxref");
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  const verify = useCallback(async () => {
    if (!reference) {
      setError("No payment reference was provided.");
      setChecking(false);
      return;
    }
    setChecking(true);
    try {
      const res = await authedFetch<{ payment: PaymentView }>(`/payments/${reference}/verify`, { method: "POST" });
      setPayment(res.payment);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify this payment.");
    } finally {
      setChecking(false);
    }
  }, [reference, authedFetch]);

  useEffect(() => {
    verify();
  }, [verify]);

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold text-navy">Payment status</h1>

      {checking && <p className="mt-4 text-sm text-text-secondary">Checking with the payment provider…</p>}

      {error && (
        <div className="mt-4">
          <FormAlert>{error}</FormAlert>
          <button type="button" onClick={verify} className="btn-secondary mt-3">
            Check again
          </button>
        </div>
      )}

      {payment && (
        <div className="card mt-4">
          <div className="flex items-center gap-2">
            <StatusBadge status={payment.status} />
            <span className="text-sm text-text-secondary">Reference {payment.reference}</span>
          </div>
          <p className="mt-3 text-lg font-semibold text-navy">
            {formatMinorUnits(payment.amountMinor, payment.currency)}
          </p>

          {payment.status === "SUCCESS" && (
            <p className="mt-2 text-sm text-success">Payment confirmed. Thank you.</p>
          )}
          {payment.status === "FAILED" && (
            <p className="mt-2 text-sm text-danger">
              {payment.failureReason ?? "This payment was not successful."}
            </p>
          )}
          {(payment.status === "PENDING" || payment.status === "PROCESSING") && (
            <div className="mt-2">
              <p className="text-sm text-text-secondary">
                Still waiting for confirmation from the payment provider.
              </p>
              <button type="button" onClick={verify} className="btn-secondary mt-3">
                Check again
              </button>
            </div>
          )}

          <Link href={`/orders/${payment.orderId}`} className="btn-primary mt-4 inline-block">
            Back to order
          </Link>
        </div>
      )}
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<p className="text-sm text-text-secondary">Loading…</p>}>
        <PaymentCallbackContent />
      </Suspense>
    </RequireAuth>
  );
}
