import { createHmac } from "crypto";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../src/config/env";
import { getPaystackProvider, verifyPaystackSignature } from "../../src/modules/payments/paystack.provider";
import { prisma } from "../../src/lib/prisma";
import { createOrderForNewBuyer } from "../commerce/helpers";
import { promoteToPlatformAdmin, registerAndLogin, testApp } from "../helpers";

function paystackInitializeResponse(reference: string) {
  return new Response(
    JSON.stringify({
      status: true,
      message: "Authorization URL created",
      data: {
        authorization_url: `https://checkout.paystack.com/${reference}`,
        access_code: `code_${reference}`,
        reference,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function paystackVerifyResponse(opts: {
  status: "success" | "failed" | "abandoned";
  amount: number;
  currency: string;
  id?: number;
  reference: string;
}) {
  return new Response(
    JSON.stringify({
      status: true,
      message: "Verification successful",
      data: {
        status: opts.status,
        amount: opts.amount,
        currency: opts.currency,
        id: opts.id ?? 123456,
        reference: opts.reference,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function signPaystackBody(body: string): string {
  return createHmac("sha512", env.PAYSTACK_SECRET_KEY!).update(body).digest("hex");
}

async function initiateForOrder(app: ReturnType<typeof testApp>, orderId: string, token: string) {
  return request(app).post(`/api/orders/${orderId}/payments`).set("Authorization", `Bearer ${token}`);
}

describe("Payments — initiate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initiates a payment with amount/currency resolved server-side from the order, not the request", async () => {
    const app = testApp();
    const { buyer, order } = await createOrderForNewBuyer(app, { unitPriceMinor: 2500, quantity: 2 });

    vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse((init?.body as string) ?? "{}");
      return paystackInitializeResponse(body.reference);
    });

    const res = await initiateForOrder(app, order.id, buyer.accessToken);

    expect(res.status).toBe(201);
    expect(res.body.payment.orderId).toBe(order.id);
    expect(res.body.payment.amountMinor).toBe(order.totalMinor);
    expect(res.body.payment.currency).toBe(order.currency);
    expect(res.body.payment.status).toBe("PENDING");
    expect(res.body.payment.authorizationUrl).toContain("checkout.paystack.com");
    expect(res.body.payment.reference).toMatch(/^ph_/);

    const auditEntries = await prisma.auditLog.findMany({ where: { action: "PAYMENT_INITIALIZED" } });
    expect(auditEntries).toHaveLength(1);
  });

  it("rejects initiation by someone other than the order's buyer — 404, not 403", async () => {
    const app = testApp();
    const { order } = await createOrderForNewBuyer(app);
    const stranger = await registerAndLogin(app);

    const res = await initiateForOrder(app, order.id, stranger.accessToken);

    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    const app = testApp();
    const { order } = await createOrderForNewBuyer(app);

    const res = await request(app).post(`/api/orders/${order.id}/payments`);

    expect(res.status).toBe(401);
  });

  it("refuses to initiate a payment for a cancelled order", async () => {
    const app = testApp();
    const { buyer, order } = await createOrderForNewBuyer(app);
    await request(app).post(`/api/orders/${order.id}/cancel`).set("Authorization", `Bearer ${buyer.accessToken}`).send({});

    const res = await initiateForOrder(app, order.id, buyer.accessToken);

    expect(res.status).toBe(409);
  });

  it("refuses to initiate a second payment once one has already succeeded", async () => {
    const app = testApp();
    const { buyer, order } = await createOrderForNewBuyer(app);
    await prisma.payment.create({
      data: {
        orderId: order.id,
        buyerUserId: buyer.userId,
        provider: "PAYSTACK",
        status: "SUCCESS",
        amountMinor: order.totalMinor,
        currency: order.currency,
        reference: "ph_already_paid",
      },
    });

    const res = await initiateForOrder(app, order.id, buyer.accessToken);

    expect(res.status).toBe(409);
  });

  it("marks the attempt FAILED (not stuck PENDING) when the provider call itself fails", async () => {
    const app = testApp();
    const { buyer, order } = await createOrderForNewBuyer(app);
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: false, message: "Invalid key" }), { status: 401 })
    );

    const res = await initiateForOrder(app, order.id, buyer.accessToken);

    expect(res.status).toBe(500);
    const payment = await prisma.payment.findFirst({ where: { orderId: order.id } });
    expect(payment?.status).toBe("FAILED");
  });

  it("fails honestly (never fakes success) when PAYSTACK_SECRET_KEY is not configured", async () => {
    const original = env.PAYSTACK_SECRET_KEY;
    env.PAYSTACK_SECRET_KEY = undefined;
    try {
      expect(() => getPaystackProvider()).toThrow(/not configured/i);
    } finally {
      env.PAYSTACK_SECRET_KEY = original;
    }
  });
});

describe("Payments — verify", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function initiatedPayment(app: ReturnType<typeof testApp>) {
    const { buyer, order } = await createOrderForNewBuyer(app, { unitPriceMinor: 5000, quantity: 1 });
    vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse((init?.body as string) ?? "{}");
      return paystackInitializeResponse(body.reference);
    });
    const initRes = await initiateForOrder(app, order.id, buyer.accessToken);
    vi.restoreAllMocks();
    return { buyer, order, payment: initRes.body.payment as { reference: string; amountMinor: number; currency: string } };
  }

  it("verifies a matching successful payment and records PAYMENT_SUCCEEDED", async () => {
    const app = testApp();
    const { buyer, payment } = await initiatedPayment(app);
    vi.spyOn(global, "fetch").mockResolvedValue(
      paystackVerifyResponse({ status: "success", amount: payment.amountMinor, currency: payment.currency, reference: payment.reference })
    );

    const res = await request(app)
      .post(`/api/payments/${payment.reference}/verify`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.payment.status).toBe("SUCCESS");
    expect(res.body.payment.verifiedAt).not.toBeNull();

    const auditEntries = await prisma.auditLog.findMany({ where: { action: "PAYMENT_SUCCEEDED" } });
    expect(auditEntries).toHaveLength(1);
  });

  it("fails closed when the provider reports a different amount than was initiated", async () => {
    const app = testApp();
    const { buyer, payment } = await initiatedPayment(app);
    vi.spyOn(global, "fetch").mockResolvedValue(
      paystackVerifyResponse({ status: "success", amount: payment.amountMinor + 1, currency: payment.currency, reference: payment.reference })
    );

    const res = await request(app)
      .post(`/api/payments/${payment.reference}/verify`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.payment.status).toBe("FAILED");
  });

  it("is safe to call repeatedly once terminal — a second verify never re-calls the provider", async () => {
    const app = testApp();
    const { buyer, payment } = await initiatedPayment(app);
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(
        paystackVerifyResponse({ status: "success", amount: payment.amountMinor, currency: payment.currency, reference: payment.reference })
      );

    const first = await request(app).post(`/api/payments/${payment.reference}/verify`).set("Authorization", `Bearer ${buyer.accessToken}`);
    expect(first.body.payment.status).toBe("SUCCESS");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const second = await request(app).post(`/api/payments/${payment.reference}/verify`).set("Authorization", `Bearer ${buyer.accessToken}`);
    expect(second.status).toBe(200);
    expect(second.body.payment.status).toBe("SUCCESS");
    // Terminal state short-circuits before ever calling the provider again.
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const auditEntries = await prisma.auditLog.findMany({ where: { action: "PAYMENT_SUCCEEDED" } });
    expect(auditEntries).toHaveLength(1);
  });

  it("rejects verification by a non-owner — 404", async () => {
    const app = testApp();
    const { payment } = await initiatedPayment(app);
    const stranger = await registerAndLogin(app);

    const res = await request(app)
      .post(`/api/payments/${payment.reference}/verify`)
      .set("Authorization", `Bearer ${stranger.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("GET /api/payments/:reference is owner-scoped — 404 for a non-owner, 200 for the owner", async () => {
    const app = testApp();
    const { buyer, payment } = await initiatedPayment(app);
    const stranger = await registerAndLogin(app);

    const strangerRes = await request(app).get(`/api/payments/${payment.reference}`).set("Authorization", `Bearer ${stranger.accessToken}`);
    expect(strangerRes.status).toBe(404);

    const ownerRes = await request(app).get(`/api/payments/${payment.reference}`).set("Authorization", `Bearer ${buyer.accessToken}`);
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.payment.reference).toBe(payment.reference);
  });
});

describe("Payments — Paystack webhook", () => {
  function buildPayload(opts: { event: string; reference: string; amount: number; currency: string; status: string; id?: number }) {
    return JSON.stringify({
      event: opts.event,
      data: { reference: opts.reference, amount: opts.amount, currency: opts.currency, status: opts.status, id: opts.id ?? 987654 },
    });
  }

  it("applies a validly signed charge.success event and marks the payment SUCCESS", async () => {
    const app = testApp();
    const { order } = await createOrderForNewBuyer(app, { unitPriceMinor: 3000, quantity: 1 });
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        buyerUserId: (await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { buyerUserId: true } })).buyerUserId,
        provider: "PAYSTACK",
        status: "PENDING",
        amountMinor: order.totalMinor,
        currency: order.currency,
        reference: "ph_webhook_success",
      },
    });

    const body = buildPayload({
      event: "charge.success",
      reference: payment.reference,
      amount: payment.amountMinor,
      currency: payment.currency,
      status: "success",
    });
    const signature = signPaystackBody(body);

    const res = await request(app)
      .post("/api/payments/webhook/paystack")
      .set("Content-Type", "application/json")
      .set("x-paystack-signature", signature)
      .send(body);

    expect(res.status).toBe(200);
    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe("SUCCESS");

    const auditEntries = await prisma.auditLog.findMany({ where: { action: "PAYMENT_SUCCEEDED", targetId: payment.id } });
    expect(auditEntries).toHaveLength(1);
  });

  it("rejects a webhook with an invalid signature and leaves the payment untouched", async () => {
    const app = testApp();
    const { order } = await createOrderForNewBuyer(app);
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        buyerUserId: (await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { buyerUserId: true } })).buyerUserId,
        provider: "PAYSTACK",
        status: "PENDING",
        amountMinor: order.totalMinor,
        currency: order.currency,
        reference: "ph_webhook_badsig",
      },
    });

    const body = buildPayload({
      event: "charge.success",
      reference: payment.reference,
      amount: payment.amountMinor,
      currency: payment.currency,
      status: "success",
    });

    const res = await request(app)
      .post("/api/payments/webhook/paystack")
      .set("Content-Type", "application/json")
      .set("x-paystack-signature", "0".repeat(128))
      .send(body);

    expect(res.status).toBe(401);
    const unchanged = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(unchanged.status).toBe("PENDING");
  });

  it("rejects a webhook with no signature header at all", async () => {
    const app = testApp();
    const body = buildPayload({ event: "charge.success", reference: "ph_nonexistent", amount: 100, currency: "NGN", status: "success" });

    const res = await request(app).post("/api/payments/webhook/paystack").set("Content-Type", "application/json").send(body);

    expect(res.status).toBe(401);
  });

  it("a byte-identical retried delivery never applies the effect twice", async () => {
    const app = testApp();
    const { order } = await createOrderForNewBuyer(app, { unitPriceMinor: 4000, quantity: 1 });
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        buyerUserId: (await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { buyerUserId: true } })).buyerUserId,
        provider: "PAYSTACK",
        status: "PENDING",
        amountMinor: order.totalMinor,
        currency: order.currency,
        reference: "ph_webhook_retry",
      },
    });

    const body = buildPayload({
      event: "charge.success",
      reference: payment.reference,
      amount: payment.amountMinor,
      currency: payment.currency,
      status: "success",
    });
    const signature = signPaystackBody(body);

    const first = await request(app)
      .post("/api/payments/webhook/paystack")
      .set("Content-Type", "application/json")
      .set("x-paystack-signature", signature)
      .send(body);
    const second = await request(app)
      .post("/api/payments/webhook/paystack")
      .set("Content-Type", "application/json")
      .set("x-paystack-signature", signature)
      .send(body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const events = await prisma.paymentWebhookEvent.findMany({ where: { paymentId: payment.id } });
    expect(events).toHaveLength(1);
    const auditEntries = await prisma.auditLog.findMany({ where: { action: "PAYMENT_SUCCEEDED", targetId: payment.id } });
    expect(auditEntries).toHaveLength(1);
  });

  it("safely records (without crashing) a webhook for a reference with no matching Payment row", async () => {
    const app = testApp();
    const body = buildPayload({ event: "charge.success", reference: "ph_unknown_reference", amount: 100, currency: "NGN", status: "success" });
    const signature = signPaystackBody(body);

    const res = await request(app)
      .post("/api/payments/webhook/paystack")
      .set("Content-Type", "application/json")
      .set("x-paystack-signature", signature)
      .send(body);

    expect(res.status).toBe(200);
    const events = await prisma.paymentWebhookEvent.findMany({ where: { eventType: "charge.success" } });
    expect(events).toHaveLength(1);
    expect(events[0].paymentId).toBeNull();
  });

  it("a webhook arriving after the payment is already terminal (FAILED) never flips it back", async () => {
    const app = testApp();
    const { order } = await createOrderForNewBuyer(app, { unitPriceMinor: 1500, quantity: 1 });
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        buyerUserId: (await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { buyerUserId: true } })).buyerUserId,
        provider: "PAYSTACK",
        status: "FAILED",
        amountMinor: order.totalMinor,
        currency: order.currency,
        reference: "ph_webhook_after_terminal",
        failureReason: "Already failed before this webhook arrived",
      },
    });

    const body = buildPayload({
      event: "charge.success",
      reference: payment.reference,
      amount: payment.amountMinor,
      currency: payment.currency,
      status: "success",
    });
    const signature = signPaystackBody(body);

    const res = await request(app)
      .post("/api/payments/webhook/paystack")
      .set("Content-Type", "application/json")
      .set("x-paystack-signature", signature)
      .send(body);

    expect(res.status).toBe(200);
    const unchanged = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(unchanged.status).toBe("FAILED");
  });
});

describe("verifyPaystackSignature (pure crypto)", () => {
  it("accepts a genuinely matching HMAC-SHA512 signature", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "x" } });
    const signature = createHmac("sha512", "a-secret").update(body).digest("hex");
    expect(verifyPaystackSignature(body, signature, "a-secret")).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "x" } });
    const signature = createHmac("sha512", "wrong-secret").update(body).digest("hex");
    expect(verifyPaystackSignature(body, signature, "a-secret")).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyPaystackSignature("{}", undefined, "a-secret")).toBe(false);
  });
});

describe("Payments — admin visibility", () => {
  // No itemized /api/admin/payments listing exists (same precedent as
  // /admin/orders, /admin/rfqs and /admin/purchase-orders: a full
  // cross-organization row listing — reference, buyer identity, amount —
  // is a bigger decision than this pass is authorized to make alone).
  // Admin visibility is an aggregate count-by-status breakdown on the
  // existing /api/admin/stats endpoint instead.
  it("lets a PLATFORM_ADMIN see an aggregate count-by-status breakdown, with no per-payment fields", async () => {
    const app = testApp();
    const { order } = await createOrderForNewBuyer(app);
    await prisma.payment.create({
      data: {
        orderId: order.id,
        buyerUserId: (await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { buyerUserId: true } })).buyerUserId,
        provider: "PAYSTACK",
        status: "SUCCESS",
        amountMinor: order.totalMinor,
        currency: order.currency,
        reference: "ph_admin_view",
      },
    });
    const admin = await registerAndLogin(app);
    await promoteToPlatformAdmin(admin.userId);

    const res = await request(app).get("/api/admin/stats").set("Authorization", `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.payments.total).toBeGreaterThanOrEqual(1);
    expect(res.body.payments.byStatus.SUCCESS).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(res.body.payments)).not.toContain("ph_admin_view");
  });

  it("denies a non-admin", async () => {
    const app = testApp();
    const regular = await registerAndLogin(app);

    const res = await request(app).get("/api/admin/stats").set("Authorization", `Bearer ${regular.accessToken}`);

    expect(res.status).toBe(403);
  });
});
