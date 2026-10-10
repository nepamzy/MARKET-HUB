import { Router } from "express";
import { z } from "zod";
import { KYC_STATUSES, VERIFICATION_STATUSES, reviewKycSchema } from "@market-hub/shared";
import { recordAudit } from "../../lib/audit";
import { AppError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { requireAuth, requirePlatformRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ORGANIZATION_SELECT } from "../organizations/organizations.service";
import { getKycSubmissionDetail, listKycSubmissions, reviewKycSubmission } from "../kyc/kyc.service";
import { adminListDirectory, adminSetDirectoryVisibility } from "../supplier/supplier.service";
import { adminListProducts } from "../products/products.service";

export const adminRouter = Router();

// Every route in this file requires the PLATFORM_ADMIN platform role, which
// is never assignable through public registration or organization
// membership — see prisma/seed.ts and docs/AUTHORIZATION.md. This keeps
// platform administration strictly separate from organization ownership
// (Rule: platform admins must be distinct from organization owners).
adminRouter.use(requireAuth, requirePlatformRole("PLATFORM_ADMIN"));

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

adminRouter.get("/organizations", validate(paginationSchema, "query"), async (req, res, next) => {
  try {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        select: ORGANIZATION_SELECT,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.organization.count(),
    ]);
    res.status(200).json({ organizations, page, pageSize, total });
  } catch (err) {
    next(err);
  }
});

const verificationSchema = z.object({
  status: z.enum(VERIFICATION_STATUSES),
});

adminRouter.patch(
  "/organizations/:organizationId/verification",
  validate(verificationSchema),
  async (req, res, next) => {
    try {
      const organization = await prisma.organization.findUnique({
        where: { id: req.params.organizationId },
      });
      if (!organization) {
        throw AppError.notFound("Organization not found");
      }

      const updated = await prisma.organization.update({
        where: { id: req.params.organizationId },
        data: { verificationStatus: req.body.status },
        select: ORGANIZATION_SELECT,
      });

      await recordAudit({
        actorUserId: req.user!.id,
        organizationId: organization.id,
        action: "ORGANIZATION_VERIFICATION_UPDATED",
        targetType: "Organization",
        targetId: organization.id,
        metadata: { previousStatus: organization.verificationStatus, newStatus: req.body.status },
      });

      res.status(200).json({ organization: updated });
    } catch (err) {
      next(err);
    }
  }
);

adminRouter.get("/users", validate(paginationSchema, "query"), async (req, res, next) => {
  try {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          platformRole: true,
          accountStatus: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.count(),
    ]);
    res.status(200).json({ users, page, pageSize, total });
  } catch (err) {
    next(err);
  }
});

// Phase 12 — the only way a user becomes (or stops being) a DRIVER.
// Deliberately scoped to CUSTOMER<->DRIVER only: this endpoint can never
// grant PLATFORM_ADMIN, which stays exactly as ungrantable through any API
// as it already was (see the module comment above) — explicit,
// server-side, auditable driver authorization (Rule), never a driver
// self-signup or marketplace (Rule 10).
const setDriverRoleSchema = z.object({
  isDriver: z.boolean(),
});

adminRouter.patch("/users/:userId/driver-role", validate(setDriverRoleSchema), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true, platformRole: true } });
    if (!user) {
      throw AppError.notFound("User not found");
    }
    if (user.platformRole === "PLATFORM_ADMIN") {
      throw AppError.conflict("Cannot change the driver role of a platform admin");
    }

    const nextRole = req.body.isDriver ? "DRIVER" : "CUSTOMER";
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { platformRole: nextRole },
      select: { id: true, name: true, email: true, platformRole: true },
    });

    await recordAudit({
      actorUserId: req.user!.id,
      action: "USER_DRIVER_ROLE_CHANGED",
      targetType: "User",
      targetId: user.id,
      metadata: { from: user.platformRole, to: nextRole },
    });

    res.status(200).json({ user: updated });
  } catch (err) {
    next(err);
  }
});

// Platform-level KYC review (Phase 2). Distinct from the bare
// PATCH .../verification endpoint above, which remains as a manual
// override an admin can still use directly; this is the real reviewed
// path, only actionable while a submission is SUBMITTED, and is the sole
// route that can ever call reviewKycSubmission — a business user has no
// route that reaches it, which is what actually prevents self-approval,
// not a check inside the service function.
const kycListQuerySchema = z.object({ status: z.enum(KYC_STATUSES).optional() });

adminRouter.get("/kyc", validate(kycListQuerySchema, "query"), async (req, res, next) => {
  try {
    const { status } = req.query as unknown as { status?: (typeof KYC_STATUSES)[number] };
    res.status(200).json(await listKycSubmissions(status));
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/kyc/:submissionId", async (req, res, next) => {
  try {
    res.status(200).json(await getKycSubmissionDetail(req.params.submissionId));
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/kyc/:submissionId/review", validate(reviewKycSchema), async (req, res, next) => {
  try {
    const result = await reviewKycSubmission(
      req.params.submissionId,
      req.user!.id,
      req.body.decision,
      req.body.note
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// Directory/supplier oversight (Phase 3). Deliberately minimal — full
// admin operations (bulk actions, richer filtering) belong to the future
// Master Admin Control Center, not this phase.
adminRouter.get("/directory", validate(paginationSchema, "query"), async (req, res, next) => {
  try {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    res.status(200).json(await adminListDirectory(page, pageSize));
  } catch (err) {
    next(err);
  }
});

const setVisibilitySchema = z.object({ isDiscoverable: z.boolean() });

adminRouter.patch("/directory/:organizationId/visibility", validate(setVisibilitySchema), async (req, res, next) => {
  try {
    const result = await adminSetDirectoryVisibility(
      req.params.organizationId,
      req.user!.id,
      req.body.isDiscoverable
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// Product catalogue oversight (Phase 4) — read-only, per the spec's
// explicit caution against giving admins arbitrary business-level editing
// powers without a clearly justified operational requirement.
adminRouter.get("/products", validate(paginationSchema, "query"), async (req, res, next) => {
  try {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    res.status(200).json(await adminListProducts(page, pageSize));
  } catch (err) {
    next(err);
  }
});

// Master Admin Control Center dashboard (Part B of the Phase 8 frontend
// pass). Counts only — no order/RFQ/PO content, no buyer/seller identity,
// nothing beyond what every other admin list endpoint already exposes as
// its own pagination `total`. The three new counts (orders, RFQs, purchase
// orders) are the one genuinely new read this adds: there was previously no
// way to answer "how much commerce/procurement activity exists on the
// platform" at all, and PHASE_0_MASTER_BLUEPRINT.md §19 names the
// Command Center as the first missing Master Admin section, gated only on
// its underlying domains existing — which, as of Phase 6-9, they now do.
// Browsing the underlying records themselves (not just counting them) is
// deliberately NOT built here: unlike a count, a full order/RFQ/PO listing
// would expose cross-organization commercial content (prices, buyer/seller
// identity, negotiated terms) that no organization consented to share with
// a party outside the deal — a materially bigger decision than this
// frontend pass is authorized to make unilaterally. Flagged as an open
// decision in the phase report rather than silently built.
adminRouter.get("/stats", async (_req, res, next) => {
  try {
    const [
      organizationsTotal,
      organizationsByVerification,
      usersTotal,
      kycPending,
      directoryDiscoverable,
      productsTotal,
      ordersTotal,
      rfqsTotal,
      purchaseOrdersTotal,
      paymentsTotal,
      paymentsByStatus,
      inventoryTrackedTotal,
      fulfillmentsTotal,
      fulfillmentsByStatus,
      deliveriesTotal,
      deliveriesByStatus,
      driversTotal,
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.organization.groupBy({ by: ["verificationStatus"], _count: true }),
      prisma.user.count(),
      prisma.kYCSubmission.count({ where: { status: "SUBMITTED" } }),
      prisma.supplierProfile.count({ where: { isActive: true, isDiscoverable: true } }),
      prisma.product.count(),
      prisma.order.count(),
      prisma.rfq.count(),
      prisma.purchaseOrder.count(),
      prisma.payment.count(),
      // Phase 10 — Payments. A count-by-status breakdown only, never
      // amounts/references/buyer identity: summing amountMinor here would
      // be misleading anyway (orders span multiple currencies, and adding
      // minor units across currencies is meaningless), and per-payment
      // rows are exactly the cross-organization commercial content this
      // endpoint has never exposed (same reasoning as orders/rfqs/
      // purchaseOrders above — Rule 8).
      prisma.payment.groupBy({ by: ["status"], _count: true }),
      // Phase 11 — Inventory. How many products are stock-tracked
      // platform-wide, nothing more: per-product onHand/reserved/available
      // is exactly the cross-organization commercial content (and, for a
      // marketplace seller, competitively sensitive operational data) this
      // endpoint has never exposed — same reasoning as every count above.
      prisma.inventory.count(),
      // Phase 12 — Fulfillment/Delivery. Counts and status breakdowns
      // only — a per-delivery row would expose recipient name/phone/
      // address and driver identity across every organization, exactly
      // the private personal and commercial information this endpoint has
      // never exposed (same reasoning as every count above, extended to
      // Rule: "do not expose unnecessary personal information").
      prisma.fulfillment.count(),
      prisma.fulfillment.groupBy({ by: ["status"], _count: true }),
      prisma.delivery.count(),
      prisma.delivery.groupBy({ by: ["status"], _count: true }),
      prisma.user.count({ where: { platformRole: "DRIVER" } }),
    ]);
    res.status(200).json({
      organizations: {
        total: organizationsTotal,
        byVerification: Object.fromEntries(organizationsByVerification.map((g) => [g.verificationStatus, g._count])),
      },
      users: { total: usersTotal },
      kyc: { pendingReview: kycPending },
      directory: { discoverable: directoryDiscoverable },
      products: { total: productsTotal },
      orders: { total: ordersTotal },
      rfqs: { total: rfqsTotal },
      purchaseOrders: { total: purchaseOrdersTotal },
      payments: {
        total: paymentsTotal,
        byStatus: Object.fromEntries(paymentsByStatus.map((g) => [g.status, g._count])),
      },
      inventory: { total: inventoryTrackedTotal },
      fulfillments: {
        total: fulfillmentsTotal,
        byStatus: Object.fromEntries(fulfillmentsByStatus.map((g) => [g.status, g._count])),
      },
      deliveries: {
        total: deliveriesTotal,
        byStatus: Object.fromEntries(deliveriesByStatus.map((g) => [g.status, g._count])),
      },
      drivers: { total: driversTotal },
    });
  } catch (err) {
    next(err);
  }
});

// Audit log browser (Phase 8 Part B). AuditLog (EXISTS since Phase A) is
// platform-wide security trail by design — see §21 of the master
// blueprint ("AuditLog is for platform security review") — unlike every
// other admin read in this file, it carries no per-organization business
// content (no prices, no commercial terms), only who-did-what-to-what and
// when, so exposing it platform-wide to PLATFORM_ADMIN is consistent with
// its original design intent, not a new privacy boundary. It has been
// written to since Phase A but had no admin UI/endpoint to read it until
// now — the one concrete gap §19 names for this section.
const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  action: z.string().optional(),
});

adminRouter.get("/audit-log", validate(auditLogQuerySchema, "query"), async (req, res, next) => {
  try {
    const { page, pageSize, action } = req.query as unknown as { page: number; pageSize: number; action?: string };
    const where = action ? { action } : {};
    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          metadata: true,
          createdAt: true,
          actor: { select: { id: true, name: true, email: true } },
          organization: { select: { id: true, legalName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);
    res.status(200).json({ entries, page, pageSize, total });
  } catch (err) {
    next(err);
  }
});
