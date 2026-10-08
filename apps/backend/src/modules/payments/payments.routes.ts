import express, { Router } from "express";
import { env } from "../../config/env";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { requireAuth } from "../../middleware/auth";
import { verifyPaystackSignature } from "./paystack.provider";
import {
  getPaymentForBuyer,
  initiatePayment,
  listPaymentsForOrder,
  processPaystackWebhook,
  verifyPayment,
} from "./payments.service";

/** Mounted at /api/orders/:orderId/payments. */
export const orderPaymentsRouter = Router({ mergeParams: true });
orderPaymentsRouter.use(requireAuth);

orderPaymentsRouter.get("/:orderId/payments", async (req, res, next) => {
  try {
    const payments = await listPaymentsForOrder(req.params.orderId, req.user!.id);
    res.status(200).json({ payments });
  } catch (err) {
    next(err);
  }
});

orderPaymentsRouter.post("/:orderId/payments", async (req, res, next) => {
  try {
    const payment = await initiatePayment(req.params.orderId, req.user!.id);
    res.status(201).json({ payment });
  } catch (err) {
    next(err);
  }
});

/** Mounted at /api/payments. Buyer-facing status/verify by reference. */
export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

paymentsRouter.get("/:reference", async (req, res, next) => {
  try {
    const payment = await getPaymentForBuyer(req.params.reference, req.user!.id);
    res.status(200).json({ payment });
  } catch (err) {
    next(err);
  }
});

paymentsRouter.post("/:reference/verify", async (req, res, next) => {
  try {
    const payment = await verifyPayment(req.params.reference, req.user!.id);
    res.status(200).json({ payment });
  } catch (err) {
    next(err);
  }
});

/**
 * Mounted at /api/payments/webhook/paystack, BEFORE the global
 * express.json() body parser (see app.ts) — signature verification needs
 * the exact raw bytes Paystack signed, and re-parsing/re-serializing JSON
 * can change key order or whitespace and silently break every signature
 * check. This router owns its own express.raw() parsing for that reason.
 *
 * Never trusts an unsigned or wrongly-signed payload (Rule: webhooks need
 * signature verification — no trust of unsigned payloads). When
 * PAYSTACK_SECRET_KEY is not configured, every webhook is rejected
 * outright, since there is no key to verify against.
 */
export const paymentsWebhookRouter = Router();

paymentsWebhookRouter.post(
  "/paystack",
  express.raw({ type: "application/json", limit: "1mb" }),
  async (req, res, next) => {
    try {
      if (!env.PAYSTACK_SECRET_KEY) {
        throw AppError.internal("Payment provider is not configured; webhook cannot be verified");
      }

      const rawBody = req.body as Buffer;
      const signature = req.header("x-paystack-signature");
      if (!verifyPaystackSignature(rawBody, signature, env.PAYSTACK_SECRET_KEY)) {
        logger.warn({ hasSignatureHeader: Boolean(signature) }, "Rejected Paystack webhook: invalid signature");
        throw AppError.unauthorized("Invalid webhook signature");
      }

      let parsed: {
        event?: string;
        data?: { reference?: string; amount?: number; currency?: string; status?: string; id?: number };
      } | null = null;
      try {
        parsed = JSON.parse(rawBody.toString("utf8"));
      } catch {
        throw AppError.badRequest("Malformed webhook payload");
      }

      const eventType = parsed?.event ?? "unknown";
      const data = parsed?.data;
      const rawStatus = data?.status === "success" ? "success" : data?.status === "failed" ? "failed" : "pending";

      await processPaystackWebhook(
        rawBody,
        eventType,
        data?.reference,
        data?.amount,
        data?.currency,
        data?.id !== undefined ? String(data.id) : undefined,
        rawStatus
      );

      // Paystack only cares that we returned 2xx; it retries on anything
      // else (same byte-identical payload/signature), which is exactly
      // the retry case the bodyHash uniqueness constraint absorbs safely.
      res.status(200).json({ received: true });
    } catch (err) {
      next(err);
    }
  }
);
