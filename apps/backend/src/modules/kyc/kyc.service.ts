import { REQUIRED_PROFILE_FIELDS } from "@market-hub/shared";
import type { KYCStatus, UpdateOrganizationProfileInput } from "@market-hub/shared";
import { recordAudit } from "../../lib/audit";
import { AppError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { notify } from "../notifications/notifications.service";

type KycDecision = Extract<KYCStatus, "VERIFIED" | "REJECTED" | "NEEDS_INFORMATION">;

const PROFILE_SELECT = {
  id: true,
  legalName: true,
  businessType: true,
  verificationStatus: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  addressLine1: true,
  city: true,
  state: true,
  country: true,
  description: true,
  registrationNumber: true,
} as const;

function findMissingProfileFields(org: Record<string, unknown>): string[] {
  return REQUIRED_PROFILE_FIELDS.filter((field) => !org[field] || String(org[field]).trim() === "");
}

export async function updateOrganizationProfile(
  organizationId: string,
  actorUserId: string,
  input: UpdateOrganizationProfileInput
) {
  // Empty string means "clear this field", distinct from "field omitted
  // entirely" (which the Zod schema already allows via .optional()) — this
  // lets the frontend send a cleared input without us treating "" as a
  // value to keep.
  const data = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value === "" ? null : value])
  );

  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data,
    select: PROFILE_SELECT,
  });

  await recordAudit({
    actorUserId,
    organizationId,
    action: "BUSINESS_PROFILE_UPDATED",
    targetType: "Organization",
    targetId: organizationId,
    metadata: { fields: Object.keys(input) },
  });

  return updated;
}

export async function getOnboardingStatus(organizationId: string) {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: PROFILE_SELECT,
  });
  const submission = await prisma.kYCSubmission.findUnique({
    where: { organizationId },
    select: {
      status: true,
      submittedAt: true,
      reviewedAt: true,
      reviewNote: true,
      reviewedBy: { select: { name: true } },
    },
  });

  const missingFields = findMissingProfileFields(org);

  return {
    profile: org,
    profileComplete: missingFields.length === 0,
    missingFields,
    kyc: submission
      ? {
          status: submission.status,
          submittedAt: submission.submittedAt,
          reviewedAt: submission.reviewedAt,
          reviewNote: submission.reviewNote,
          reviewedByName: submission.reviewedBy?.name ?? null,
        }
      : null, // NOT_STARTED — no row exists yet, computed here rather than stored
  };
}

/**
 * The only mutation that creates or advances a KYCSubmission. There is
 * deliberately no separate "save KYC draft" step in this lightweight
 * design — the business profile fields (updateOrganizationProfile above)
 * are what gets filled in beforehand; submission is the one explicit,
 * audited action that moves the business into the review queue. This means
 * the DRAFT status is schema-default-only and not reachable through any
 * route in this phase — noted here rather than left unexplained.
 */
export async function submitKyc(organizationId: string, actorUserId: string) {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: PROFILE_SELECT,
  });
  const missingFields = findMissingProfileFields(org);
  if (missingFields.length > 0) {
    throw AppError.badRequest("Business profile is incomplete", { missingFields });
  }

  const existing = await prisma.kYCSubmission.findUnique({ where: { organizationId } });
  if (existing && (existing.status === "SUBMITTED" || existing.status === "VERIFIED")) {
    throw AppError.conflict(
      existing.status === "VERIFIED"
        ? "This business is already verified"
        : "A submission is already awaiting review"
    );
  }

  const submission = await prisma.kYCSubmission.upsert({
    where: { organizationId },
    create: {
      organizationId,
      status: "SUBMITTED",
      submittedByUserId: actorUserId,
      submittedAt: new Date(),
    },
    update: {
      status: "SUBMITTED",
      submittedByUserId: actorUserId,
      submittedAt: new Date(),
      reviewNote: null,
      reviewedByUserId: null,
      reviewedAt: null,
    },
    select: { id: true, status: true, submittedAt: true },
  });

  await recordAudit({
    actorUserId,
    organizationId,
    action: "KYC_SUBMITTED",
    targetType: "KYCSubmission",
    targetId: submission.id,
  });

  return submission;
}

const ADMIN_LIST_SELECT = {
  id: true,
  status: true,
  submittedAt: true,
  reviewedAt: true,
  organization: { select: { id: true, legalName: true, businessType: true } },
} as const;

export async function listKycSubmissions(status?: KYCStatus) {
  return prisma.kYCSubmission.findMany({
    where: status ? { status } : {},
    select: ADMIN_LIST_SELECT,
    orderBy: { submittedAt: "desc" },
  });
}

export async function getKycSubmissionDetail(submissionId: string) {
  const submission = await prisma.kYCSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      status: true,
      submittedAt: true,
      reviewedAt: true,
      reviewNote: true,
      submittedBy: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true } },
      organization: { select: PROFILE_SELECT },
    },
  });
  if (!submission) {
    throw AppError.notFound("KYC submission not found");
  }
  return submission;
}

const AUDIT_ACTION_BY_DECISION = {
  VERIFIED: "KYC_APPROVED",
  REJECTED: "KYC_REJECTED",
  NEEDS_INFORMATION: "KYC_INFO_REQUESTED",
} as const;

/**
 * Platform-admin-only decision, reachable exclusively through the admin
 * router (requirePlatformRole("PLATFORM_ADMIN")) — there is no path from
 * any organization-scoped route to this function, which is what actually
 * prevents a business from approving its own verification, not a check
 * inside this function itself. Only actionable while the submission is
 * SUBMITTED; a business must explicitly resubmit (submitKyc) after
 * REJECTED or NEEDS_INFORMATION before it can be reviewed again.
 */
export async function reviewKycSubmission(
  submissionId: string,
  reviewerUserId: string,
  decision: KycDecision,
  note: string | undefined
) {
  return prisma.$transaction(async (tx) => {
    const submission = await tx.kYCSubmission.findUnique({ where: { id: submissionId } });
    if (!submission) {
      throw AppError.notFound("KYC submission not found");
    }
    if (submission.status !== "SUBMITTED") {
      throw AppError.conflict("This submission is not currently awaiting review");
    }

    const updated = await tx.kYCSubmission.update({
      where: { id: submissionId },
      data: {
        status: decision,
        reviewedByUserId: reviewerUserId,
        reviewedAt: new Date(),
        reviewNote: note ?? null,
      },
    });

    // Keep the coarse Organization.verificationStatus flag in sync in the
    // same transaction — NEEDS_INFORMATION leaves it at PENDING, since the
    // business is neither verified nor finally rejected.
    if (decision === "VERIFIED" || decision === "REJECTED") {
      await tx.organization.update({
        where: { id: submission.organizationId },
        data: { verificationStatus: decision },
      });
    }

    await recordAudit({
      actorUserId: reviewerUserId,
      organizationId: submission.organizationId,
      action: AUDIT_ACTION_BY_DECISION[decision],
      targetType: "KYCSubmission",
      targetId: submissionId,
      metadata: { note },
    });

    if (submission.submittedByUserId) {
      const DECISION_COPY: Record<KycDecision, string> = {
        VERIFIED: "Your business verification was approved.",
        REJECTED: "Your business verification was rejected.",
        NEEDS_INFORMATION: "Additional information is needed for your business verification.",
      };
      await notify({
        recipientUserId: submission.submittedByUserId,
        type: "KYC_STATUS_CHANGED",
        title: "Business verification update",
        message: note ? `${DECISION_COPY[decision]} ${note}` : DECISION_COPY[decision],
        relatedEntityType: "KYCSubmission",
        relatedEntityId: submissionId,
        dedupeKey: `KYC_STATUS_CHANGED:${submissionId}:${decision}`,
      });
    }

    return updated;
  });
}
