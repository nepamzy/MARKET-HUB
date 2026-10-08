import { createHash, randomUUID } from "crypto";
import { recordAudit } from "../../lib/audit";
import { AppError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { consumeReservationForOrder } from "../inventory/inventory.service";
import type { PaymentProviderClient } from "./paystack.provider";
import { getPaystackProvider } from "./paystack.provider";

const PAYMENT_SELECT = {
  id: true,
  orderId: true,
  buyerUserId: true,
  provider: true,
  status: true,
  amountMinor: true,
  currency: true,
  reference: true,
  providerTransactionId: true,
  authorizationUrl: true,
  failureReason: true,
  initializedAt: true,
  verifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Loads the order and asserts the caller is its buyer — payments are
 * always initiated/viewed by the buyer who placed the order, never by the
 * seller side or an unrelated user (Rule 6/7). Identical 404 whether the
 * order doesn't exist or belongs to someone else, same discipline
 * orders.service.ts already uses.
 */
async function getOwnedOrderOrThrow(orderId: string, buyerUserId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, buyerUserId: true, status: true, currency: true, totalMinor: true },
  });
  if (!order || order.buyerUserId !== buyerUserId) {
    throw AppError.notFound("Order not found");
  }
  return order;
}

/**
 * Initiates a new payment attempt for an order. amountMinor/currency are
 * always resolved server-side from the Order row itself — never from the
 * request body (Rule 6) — and a brand-new Payment row + our own
 * `reference` are created before the provider is ever called, so the
 * reference exists in our database the instant it is handed to Paystack.
 * A CANCELLED order can never be paid; otherwise, any number of PENDING/
 * FAILED attempts may exist, but only one SUCCESS payment can ever be
 * recorded for a given order (enforced in recordVerificationResult, not
 * here, since a second initialize on an already-paid order should still
 * fail honestly rather than silently 404).
 */
export async function initiatePayment(
  orderId: string,
  buyerUserId: string,
  provider: PaymentProviderClient = getPaystackProvider()
) {
  const order = await getOwnedOrderOrThrow(orderId, buyerUserId);

  // The buyer's email is resolved server-side from their own account row,
  // never taken from client input — Paystack's initialize call requires
  // one, and this is the only authoritative source for who the
  // authenticated buyer actually is (Rule 6).
  const buyer = await prisma.user.findUniqueOrThrow({ where: { id: buyerUserId }, select: { email: true } });
  const buyerEmail = buyer.email;

  if (order.status === "CANCELLED") {
    throw AppError.conflict("A cancelled order cannot be paid for");
  }

  const existingSuccess = await prisma.payment.findFirst({
    where: { orderId: order.id, status: "SUCCESS" },
    select: { id: true },
  });
  if (existingSuccess) {
    throw AppError.conflict("This order has already been paid for");
  }

  const reference = `ph_${randomUUID()}`;

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      buyerUserId,
      provider: "PAYSTACK",
      status: "PENDING",
      amountMinor: order.totalMinor,
      currency: order.currency,
      reference,
    },
    select: PAYMENT_SELECT,
  });

  await recordAudit({
    actorUserId: buyerUserId,
    action: "PAYMENT_INITIALIZED",
    targetType: "Payment",
    targetId: payment.id,
    metadata: { orderId: order.id, amountMinor: order.totalMinor, currency: order.currency },
  });

  try {
    const result = await provider.initialize({
      reference,
      amountMinor: order.totalMinor,
      currency: order.currency,
      buyerEmail,
    });

    return prisma.payment.update({
      where: { id: payment.id },
      data: { authorizationUrl: result.authorizationUrl, providerTransactionId: result.providerTransactionId },
      select: PAYMENT_SELECT,
    });
  } catch (err) {
    // The provider call failed before any money could have moved — record
    // the attempt as FAILED rather than leaving it stuck PENDING forever,
    // but never swallow the error: the caller still needs to see it.
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason: "Provider initialize call failed" },
    });
    await recordAudit({
      actorUserId: buyerUserId,
      action: "PAYMENT_FAILED",
      targetType: "Payment",
      targetId: payment.id,
      metadata: { orderId: order.id, reason: "initialize_error" },
    });
    throw err;
  }
}

/** Either the buyer who owns the payment, or any viewer resolving their
 * own order's payments — same anti-enumeration discipline as
 * getOrderForViewer: a non-party gets 404, never 403. */
async function getOwnedPaymentOrThrow(reference: string, viewerUserId: string) {
  const payment = await prisma.payment.findUnique({ where: { reference }, select: PAYMENT_SELECT });
  if (!payment || payment.buyerUserId !== viewerUserId) {
    throw AppError.notFound("Payment not found");
  }
  return payment;
}

export async function getPaymentForBuyer(reference: string, buyerUserId: string) {
  return getOwnedPaymentOrThrow(reference, buyerUserId);
}

export async function listPaymentsForOrder(orderId: string, buyerUserId: string) {
  await getOwnedOrderOrThrow(orderId, buyerUserId);
  return prisma.payment.findMany({
    where: { orderId },
    select: PAYMENT_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Applies a provider verification result to a Payment row. Shared by both
 * the buyer-triggered "check my payment" endpoint (polling after the
 * redirect back from Paystack) and the webhook handler — the exact same
 * function, so a webhook arriving first and a buyer poll arriving second
 * (or vice versa) converge on the same outcome rather than two divergent
 * code paths. Idempotent/safe to call repeatedly: once a payment is
 * SUCCESS or FAILED (terminal), calling this again is a no-op that
 * returns the existing row unchanged — a payment's outcome is decided
 * exactly once (Rule: a webhook after terminal state must be handled
 * safely; repeated verification must be safe).
 */
async function applyVerificationResult(
  paymentId: string,
  result: { status: "success" | "failed" | "pending"; amountMinor: number; currency: string; providerTransactionId: string }
) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw AppError.notFound("Payment not found");
    }

    if (payment.status === "SUCCESS" || payment.status === "FAILED") {
      // Already terminal — never overwrite a decided outcome.
      return payment;
    }

    if (result.amountMinor !== payment.amountMinor || result.currency !== payment.currency) {
      // The provider is reporting a different amount/currency than what
      // we actually initiated — never trust it, fail closed rather than
      // record a mismatched success.
      const failed = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: "FAILED",
          failureReason: "Provider-reported amount/currency did not match the initiated payment",
          providerTransactionId: payment.providerTransactionId ?? result.providerTransactionId,
          verifiedAt: new Date(),
        },
      });
      return failed;
    }

    if (result.status === "pending") {
      return tx.payment.update({
        where: { id: paymentId },
        data: { status: "PROCESSING", providerTransactionId: result.providerTransactionId },
      });
    }

    const nextStatus = result.status === "success" ? "SUCCESS" : "FAILED";
    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: nextStatus,
        providerTransactionId: result.providerTransactionId,
        verifiedAt: new Date(),
        failureReason: nextStatus === "FAILED" ? "Provider reported the payment as failed" : null,
      },
    });

    if (nextStatus === "SUCCESS") {
      // Phase 11 — same transaction as the SUCCESS write: either the
      // payment status and the stock consumption both commit, or neither
      // does. Reused by both the buyer-poll and webhook paths, same as
      // this whole function, and only ever reached once per payment
      // thanks to the terminal-state short-circuit above.
      await consumeReservationForOrder(tx, updated.orderId);
    }

    return updated;
  });
}

/**
 * Buyer-triggered verification — called after the browser redirects back
 * from Paystack's hosted checkout. The redirect itself proves nothing
 * (Rule: never determine success from frontend redirect alone); this
 * always makes a fresh server-to-server verify call against Paystack
 * before reporting any status.
 */
export async function verifyPayment(
  reference: string,
  buyerUserId: string,
  provider: PaymentProviderClient = getPaystackProvider()
) {
  const payment = await getOwnedPaymentOrThrow(reference, buyerUserId);

  if (payment.status === "SUCCESS" || payment.status === "FAILED") {
    return payment;
  }

  const result = await provider.verify(reference);
  const updated = await applyVerificationResult(payment.id, result);

  await recordAudit({
    actorUserId: buyerUserId,
    action: updated.status === "SUCCESS" ? "PAYMENT_SUCCEEDED" : updated.status === "FAILED" ? "PAYMENT_FAILED" : "PAYMENT_PROCESSING",
    targetType: "Payment",
    targetId: payment.id,
    metadata: { orderId: payment.orderId, source: "buyer_verify" },
  });

  return prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, select: PAYMENT_SELECT });
}

export class InvalidWebhookSignatureError extends Error {}

/**
 * Processes one inbound Paystack webhook delivery. `rawBody` must be the
 * exact bytes Paystack signed. Idempotency is enforced by hashing that
 * exact raw body and relying on PaymentWebhookEvent.bodyHash's unique
 * constraint — a byte-identical retried delivery (which is how Paystack
 * retries work) collides on insert and is safely ignored before any
 * Payment write happens. A non-retried but logically duplicate delivery
 * (e.g. Paystack sending both charge.success and a near-identical event)
 * is still safe because applyVerificationResult is itself idempotent once
 * a payment reaches a terminal state.
 */
export async function processPaystackWebhook(
  rawBody: Buffer,
  eventType: string,
  reference: string | undefined,
  verifiedAmountMinor: number | undefined,
  verifiedCurrency: string | undefined,
  verifiedProviderTransactionId: string | undefined,
  rawStatus: "success" | "failed" | "pending"
): Promise<{ recorded: boolean; duplicate: boolean }> {
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");

  const payment = reference
    ? await prisma.payment.findUnique({ where: { reference }, select: { id: true } })
    : null;

  try {
    await prisma.paymentWebhookEvent.create({
      data: {
        provider: "PAYSTACK",
        eventType,
        bodyHash,
        paymentId: payment?.id ?? null,
      },
    });
  } catch (err) {
    // Unique constraint violation on bodyHash = a byte-identical retry of
    // a delivery we already processed. Record nothing further and report
    // success back to Paystack (so it stops retrying) without touching
    // the Payment row a second time.
    if (isUniqueConstraintError(err)) {
      return { recorded: false, duplicate: true };
    }
    throw err;
  }

  if (!payment || !reference) {
    // A webhook for a reference we have no Payment row for. Already
    // safely recorded above (paymentId: null) for audit/investigation —
    // there is nothing further to apply.
    return { recorded: true, duplicate: false };
  }

  if (verifiedAmountMinor === undefined || verifiedCurrency === undefined || verifiedProviderTransactionId === undefined) {
    return { recorded: true, duplicate: false };
  }

  const updated = await applyVerificationResult(payment.id, {
    status: rawStatus,
    amountMinor: verifiedAmountMinor,
    currency: verifiedCurrency,
    providerTransactionId: verifiedProviderTransactionId,
  });

  await recordAudit({
    action: updated.status === "SUCCESS" ? "PAYMENT_SUCCEEDED" : updated.status === "FAILED" ? "PAYMENT_FAILED" : "PAYMENT_PROCESSING",
    targetType: "Payment",
    targetId: payment.id,
    metadata: { orderId: updated.orderId, source: "webhook", eventType },
  });

  return { recorded: true, duplicate: false };
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "P2002";
}
