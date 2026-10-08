import { createHmac, timingSafeEqual } from "crypto";
import { env } from "../../config/env";
import { AppError } from "../../lib/errors";

/**
 * Provider-agnostic shape payments.service.ts depends on. PAYSTACK is the
 * only PaymentProvider value today (Rule 1/9: no other provider or
 * settlement mechanism has been approved), but the service layer never
 * calls the Paystack HTTP client directly — every call goes through this
 * interface so a test can substitute a fake implementing the same
 * contract without ever faking a *production* success path.
 */
export interface InitializeParams {
  reference: string;
  amountMinor: number;
  currency: string;
  buyerEmail: string;
}

export interface InitializeResult {
  authorizationUrl: string;
  providerTransactionId: string;
}

export type VerifyStatus = "success" | "failed" | "pending";

export interface VerifyResult {
  status: VerifyStatus;
  amountMinor: number;
  currency: string;
  providerTransactionId: string;
}

export interface PaymentProviderClient {
  initialize(params: InitializeParams): Promise<InitializeResult>;
  verify(reference: string): Promise<VerifyResult>;
}

const PAYSTACK_BASE_URL = "https://api.paystack.co";

/**
 * Real Paystack adapter (the "Standard" hosted-checkout integration: we
 * never collect card details ourselves). Every call is a genuine HTTPS
 * request to api.paystack.co using PAYSTACK_SECRET_KEY — there is no
 * dev/mock mode inside this class. When the key is not configured,
 * getPaystackProvider() below refuses to construct one at all, so the
 * absence of credentials surfaces as an explicit, honest error rather
 * than a silently faked response (Rule 5/20).
 */
export class PaystackProvider implements PaymentProviderClient {
  constructor(private readonly secretKey: string) {}

  async initialize(params: InitializeParams): Promise<InitializeResult> {
    const body: Record<string, unknown> = {
      email: params.buyerEmail,
      amount: params.amountMinor,
      currency: params.currency,
      reference: params.reference,
    };
    if (env.PAYSTACK_CALLBACK_URL) {
      body.callback_url = env.PAYSTACK_CALLBACK_URL;
    }

    const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const payload = (await res.json().catch(() => null)) as PaystackInitializeResponse | null;
    if (!res.ok || !payload?.status || !payload.data) {
      throw AppError.internal(
        `Paystack initialize failed: ${payload?.message ?? `HTTP ${res.status}`}`
      );
    }

    return {
      authorizationUrl: payload.data.authorization_url,
      providerTransactionId: payload.data.access_code,
    };
  }

  async verify(reference: string): Promise<VerifyResult> {
    const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.secretKey}` },
    });

    const payload = (await res.json().catch(() => null)) as PaystackVerifyResponse | null;
    if (!res.ok || !payload?.status || !payload.data) {
      throw AppError.internal(`Paystack verify failed: ${payload?.message ?? `HTTP ${res.status}`}`);
    }

    return {
      status: mapPaystackStatus(payload.data.status),
      amountMinor: payload.data.amount,
      currency: payload.data.currency,
      providerTransactionId: String(payload.data.id),
    };
  }
}

interface PaystackInitializeResponse {
  status: boolean;
  message?: string;
  data?: { authorization_url: string; access_code: string; reference: string };
}

interface PaystackVerifyResponse {
  status: boolean;
  message?: string;
  data?: { status: string; amount: number; currency: string; id: number; reference: string };
}

function mapPaystackStatus(raw: string): VerifyStatus {
  if (raw === "success") return "success";
  if (raw === "failed" || raw === "abandoned" || raw === "reversed") return "failed";
  return "pending";
}

/**
 * Lazily constructed so the application boots fine without
 * PAYSTACK_SECRET_KEY set (dev/CI) — the error only surfaces when a
 * payment is actually initiated, which is the honest point to fail
 * (Rule 20: say exactly what is blocked, never fake the result).
 */
export function getPaystackProvider(): PaymentProviderClient {
  if (!env.PAYSTACK_SECRET_KEY) {
    throw AppError.internal(
      "Payment provider is not configured: PAYSTACK_SECRET_KEY is not set. No payment can be initiated or verified until a real Paystack secret key is provided — this is never faked."
    );
  }
  return new PaystackProvider(env.PAYSTACK_SECRET_KEY);
}

/**
 * Verifies a Paystack webhook signature. Pure crypto, no network call, so
 * it is independently testable without a configured provider — but it
 * still requires PAYSTACK_SECRET_KEY to exist (an unconfigured
 * environment cannot verify webhooks at all, and payments.routes.ts
 * rejects every webhook outright in that case rather than trusting an
 * unsigned payload). `rawBody` must be the exact, unparsed request body
 * bytes Paystack signed — re-serializing a parsed JSON object can change
 * key order/whitespace and silently break every signature check.
 */
export function verifyPaystackSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  secretKey: string
): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signatureHeader, "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
