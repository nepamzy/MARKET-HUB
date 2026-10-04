import type { CreateRequisitionInput, RequisitionListQuery, RequisitionStatus, UpdateRequisitionDraftInput } from "@market-hub/shared";
import { recordAudit } from "../../lib/audit";
import { AppError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";

const REQUISITION_ITEM_SELECT = {
  id: true,
  productId: true,
  itemName: true,
  quantity: true,
  unit: true,
  specification: true,
  createdAt: true,
} as const;

const REQUISITION_SELECT = {
  id: true,
  sequenceNumber: true,
  buyerOrganizationId: true,
  requestedByUserId: true,
  // Phase 7 frontend pass: both additive selects on existing relations, no
  // schema/migration change. requestedByUser lets the detail page show who
  // within the organization raised it (useful once more than one member
  // creates requisitions). rfqs lets the detail page link straight to the
  // resulting RFQ once status is RFQ_CREATED — without this the page had
  // no way to reach the RFQ it just created, a dead end found while
  // reviewing the existing detail page. Business rule (not a DB
  // constraint) keeps this effectively 1:1: createRfq only accepts a
  // SUBMITTED requisition and immediately transitions it to RFQ_CREATED,
  // so a second RFQ can never be created from the same requisition.
  requestedByUser: { select: { id: true, name: true, email: true } },
  rfqs: { select: { id: true, status: true } },
  title: true,
  status: true,
  submittedAt: true,
  cancelledAt: true,
  cancelReason: true,
  createdAt: true,
  updatedAt: true,
  items: { select: REQUISITION_ITEM_SELECT },
} as const;

/** "REQ-000123" — display-only, never a second column to keep in sync. */
function formatReference(sequenceNumber: number): string {
  return `REQ-${String(sequenceNumber).padStart(6, "0")}`;
}

function withReference<T extends { sequenceNumber: number }>(requisition: T) {
  return { ...requisition, reference: formatReference(requisition.sequenceNumber) };
}

/**
 * Centralized, explicit transition table (Phase 7 §8), same discipline as
 * orders.service.ts's ORDER_STATUS_TRANSITIONS — CANCELLED is only
 * reachable from DRAFT/SUBMITTED (see schema.prisma's RequisitionStatus
 * doc comment for why RFQ_CREATED has no further transition in this phase).
 */
const REQUISITION_STATUS_TRANSITIONS: Record<RequisitionStatus, RequisitionStatus[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["RFQ_CREATED", "CANCELLED"],
  RFQ_CREATED: [],
  CANCELLED: [],
};

async function assertRequisitionOwnership(organizationId: string, requisitionId: string) {
  const requisition = await prisma.requisition.findFirst({
    where: { id: requisitionId, buyerOrganizationId: organizationId },
    select: { id: true, status: true },
  });
  if (!requisition) {
    throw AppError.notFound("Requisition not found");
  }
  return requisition;
}

export async function createRequisition(
  organizationId: string,
  actorUserId: string,
  input: CreateRequisitionInput
) {
  const requisition = await prisma.requisition.create({
    data: {
      buyerOrganizationId: organizationId,
      requestedByUserId: actorUserId,
      title: input.title,
      items: { create: input.items },
    },
    select: REQUISITION_SELECT,
  });

  await recordAudit({
    actorUserId,
    organizationId,
    action: "REQUISITION_CREATED",
    targetType: "Requisition",
    targetId: requisition.id,
    metadata: { itemCount: input.items.length },
  });

  return withReference(requisition);
}

export async function listRequisitions(organizationId: string, query: RequisitionListQuery) {
  const where = {
    buyerOrganizationId: organizationId,
    ...(query.status ? { status: query.status } : {}),
  };

  const [requisitions, total] = await Promise.all([
    prisma.requisition.findMany({
      where,
      select: REQUISITION_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.requisition.count({ where }),
  ]);

  return { requisitions: requisitions.map(withReference), page: query.page, pageSize: query.pageSize, total };
}

export async function getRequisition(organizationId: string, requisitionId: string) {
  const requisition = await prisma.requisition.findFirst({
    where: { id: requisitionId, buyerOrganizationId: organizationId },
    select: REQUISITION_SELECT,
  });
  if (!requisition) {
    throw AppError.notFound("Requisition not found");
  }
  return withReference(requisition);
}

/**
 * Only ever accepted while DRAFT (Phase 7 §8/§24: legal state transitions).
 * `items`, when supplied, is the COMPLETE replacement list — same
 * replace-not-merge convention as Phase 5's ProductPrice array — which is
 * why whole-array validation in the Zod schema is sufficient.
 */
export async function updateRequisitionDraft(
  organizationId: string,
  requisitionId: string,
  actorUserId: string,
  input: UpdateRequisitionDraftInput
) {
  const existing = await assertRequisitionOwnership(organizationId, requisitionId);
  if (existing.status !== "DRAFT") {
    throw AppError.conflict(`Cannot update a requisition in status ${existing.status}`);
  }

  const { items, ...fields } = input;

  const requisition = await prisma.$transaction(async (tx) => {
    if (items) {
      await tx.requisitionItem.deleteMany({ where: { requisitionId } });
    }
    return tx.requisition.update({
      where: { id: requisitionId },
      data: {
        ...fields,
        ...(items ? { items: { create: items } } : {}),
      },
      select: REQUISITION_SELECT,
    });
  });

  await recordAudit({
    actorUserId,
    organizationId,
    action: "REQUISITION_UPDATED",
    targetType: "Requisition",
    targetId: requisitionId,
    metadata: { fields: Object.keys(input) },
  });

  return withReference(requisition);
}

async function transitionRequisition(
  organizationId: string,
  requisitionId: string,
  to: RequisitionStatus,
  actorUserId: string,
  auditAction: string,
  extraData: Record<string, unknown> = {}
) {
  const existing = await assertRequisitionOwnership(organizationId, requisitionId);
  if (!REQUISITION_STATUS_TRANSITIONS[existing.status].includes(to)) {
    throw AppError.conflict(`Cannot move a requisition from ${existing.status} to ${to}`);
  }

  const requisition = await prisma.requisition.update({
    where: { id: requisitionId },
    data: { status: to, ...extraData },
    select: REQUISITION_SELECT,
  });

  await recordAudit({
    actorUserId,
    organizationId,
    action: auditAction,
    targetType: "Requisition",
    targetId: requisitionId,
    metadata: { from: existing.status, to },
  });

  return withReference(requisition);
}

export async function submitRequisition(organizationId: string, requisitionId: string, actorUserId: string) {
  return transitionRequisition(organizationId, requisitionId, "SUBMITTED", actorUserId, "REQUISITION_SUBMITTED", {
    submittedAt: new Date(),
  });
}

export async function cancelRequisition(
  organizationId: string,
  requisitionId: string,
  actorUserId: string,
  reason: string | undefined
) {
  return transitionRequisition(organizationId, requisitionId, "CANCELLED", actorUserId, "REQUISITION_CANCELLED", {
    cancelledAt: new Date(),
    cancelReason: reason ?? null,
  });
}
