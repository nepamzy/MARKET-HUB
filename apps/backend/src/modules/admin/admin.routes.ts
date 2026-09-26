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
