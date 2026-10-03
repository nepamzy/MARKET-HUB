import type { CreateSupplierResponseInput, UpdateSupplierResponseDraftInput } from "@market-hub/shared";
import { recordAudit } from "../../lib/audit";
import { AppError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";

const RESPONSE_ITEM_SELECT = {
  id: true,
  rfqItemId: true,
  quantity: true,
  unit: true,
  unitPriceMinor: true,
  currency: true,
  leadTimeDays: true,
  notes: true,
} as const;

const RESPONSE_SELECT = {
  id: true,
  rfqId: true,
  supplierOrganizationId: true,
  status: true,
  notes: true,
  submittedAt: true,
  withdrawnAt: true,
  createdAt: true,
  updatedAt: true,
  items: { select: RESPONSE_ITEM_SELECT },
} as const;

/**
 * Loads the RFQ this organization is actually targeted on, or throws the
 * same 404 a nonexistent RFQ would (Phase 7 §16: a supplier must not be
 * able to confirm a private RFQ's existence by probing IDs it was never
 * invited to). Also rejects a still-DRAFT RFQ identically — targeting
 * alone grants no visibility before issuance (Phase 7 §18).
 */
async function assertTargetedAndIssued(organizationId: string, rfqId: string) {
  const target = await prisma.rfqSupplierTarget.findUnique({
    where: { rfqId_supplierOrganizationId: { rfqId, supplierOrganizationId: organizationId } },
    select: {
      rfq: { select: { id: true, status: true, items: { select: { id: true } } } },
    },
  });
  if (!target || target.rfq.status === "DRAFT") {
    throw AppError.notFound("RFQ not found");
  }
  return target.rfq;
}

function assertItemsMapToRfq(validRfqItemIds: Set<string>, items: { rfqItemId: string }[]) {
  const invalid = items.filter((item) => !validRfqItemIds.has(item.rfqItemId)).map((item) => item.rfqItemId);
  if (invalid.length > 0) {
    throw AppError.badRequest("One or more response items do not map to a valid RFQ item", { invalidRfqItemIds: invalid });
  }
}

/**
 * Creates a supplier's DRAFT response (Phase 7 §12). One response per
 * (rfq, supplier) — the unique constraint plus this explicit pre-check is
 * the idempotency guard (Phase 7 §21): a duplicate "create response"
 * request is rejected with 409 rather than silently producing a second row
 * or silently overwriting the first.
 */
export async function createSupplierResponse(
  organizationId: string,
  rfqId: string,
  actorUserId: string,
  input: CreateSupplierResponseInput
) {
  const rfq = await assertTargetedAndIssued(organizationId, rfqId);

  const existing = await prisma.supplierResponse.findUnique({
    where: { rfqId_supplierOrganizationId: { rfqId, supplierOrganizationId: organizationId } },
    select: { id: true },
  });
  if (existing) {
    throw AppError.conflict("A response already exists for this RFQ");
  }

  const validRfqItemIds = new Set(rfq.items.map((item) => item.id));
  assertItemsMapToRfq(validRfqItemIds, input.items);

  const response = await prisma.supplierResponse.create({
    data: {
      rfqId,
      supplierOrganizationId: organizationId,
      submittedByUserId: actorUserId,
      notes: input.notes,
      items: { create: input.items },
    },
    select: RESPONSE_SELECT,
  });

  await recordAudit({
    actorUserId,
    organizationId,
    action: "SUPPLIER_RESPONSE_CREATED",
    targetType: "SupplierResponse",
    targetId: response.id,
    metadata: { rfqId, itemCount: input.items.length },
  });

  return response;
}

async function getOwnDraftResponse(organizationId: string, rfqId: string) {
  const response = await prisma.supplierResponse.findUnique({
    where: { rfqId_supplierOrganizationId: { rfqId, supplierOrganizationId: organizationId } },
    select: { id: true, status: true },
  });
  if (!response) {
    throw AppError.notFound("Response not found");
  }
  return response;
}

/**
 * Only ever accepted while DRAFT. `items`, when supplied, is the COMPLETE
 * replacement list, same convention as every other "replace, not merge"
 * array in this codebase (Phase 5's ProductPrice, Phase 7's own
 * requisition items). Submitted history is never touched by this
 * function — see SupplierResponseStatus's doc comment.
 */
export async function updateSupplierResponseDraft(
  organizationId: string,
  rfqId: string,
  actorUserId: string,
  input: UpdateSupplierResponseDraftInput
) {
  const existing = await getOwnDraftResponse(organizationId, rfqId);
  if (existing.status !== "DRAFT") {
    throw AppError.conflict(`Cannot update a response in status ${existing.status}`);
  }

  if (input.items) {
    const rfqItems = await prisma.rfqItem.findMany({ where: { rfqId }, select: { id: true } });
    assertItemsMapToRfq(new Set(rfqItems.map((i) => i.id)), input.items);
  }

  const { items, ...fields } = input;

  const response = await prisma.$transaction(async (tx) => {
    if (items) {
      await tx.supplierResponseItem.deleteMany({ where: { responseId: existing.id } });
    }
    return tx.supplierResponse.update({
      where: { id: existing.id },
      data: {
        ...fields,
        ...(items ? { items: { create: items } } : {}),
      },
      select: RESPONSE_SELECT,
    });
  });

  await recordAudit({
    actorUserId,
    organizationId,
    action: "SUPPLIER_RESPONSE_UPDATED",
    targetType: "SupplierResponse",
    targetId: existing.id,
    metadata: { fields: Object.keys(input) },
  });

  return response;
}

/** DRAFT -> SUBMITTED. Also marks this supplier's RfqSupplierTarget row
 * RESPONDED (Phase 7 §11) — a buyer-visible signal distinct from the
 * response's own status, set only now, never for a draft. */
export async function submitSupplierResponse(organizationId: string, rfqId: string, actorUserId: string) {
  const existing = await getOwnDraftResponse(organizationId, rfqId);
  if (existing.status !== "DRAFT") {
    throw AppError.conflict(`Cannot submit a response in status ${existing.status}`);
  }

  const response = await prisma.$transaction(async (tx) => {
    const updated = await tx.supplierResponse.update({
      where: { id: existing.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
      select: RESPONSE_SELECT,
    });
    await tx.rfqSupplierTarget.update({
      where: { rfqId_supplierOrganizationId: { rfqId, supplierOrganizationId: organizationId } },
      data: { status: "RESPONDED", respondedAt: new Date() },
    });
    return updated;
  });

  await recordAudit({
    actorUserId,
    organizationId,
    action: "SUPPLIER_RESPONSE_SUBMITTED",
    targetType: "SupplierResponse",
    targetId: existing.id,
    metadata: { rfqId },
  });

  return response;
}

/** SUBMITTED -> WITHDRAWN only (Phase 7 §14) — never reachable from DRAFT
 * (nothing has been shared with the buyer yet to withdraw) and itself
 * terminal (no negotiation/resubmission exists this phase). */
export async function withdrawSupplierResponse(organizationId: string, rfqId: string, actorUserId: string) {
  const existing = await getOwnDraftResponse(organizationId, rfqId);
  if (existing.status !== "SUBMITTED") {
    throw AppError.conflict(`Cannot withdraw a response in status ${existing.status}`);
  }

  const response = await prisma.supplierResponse.update({
    where: { id: existing.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() },
    select: RESPONSE_SELECT,
  });

  await recordAudit({
    actorUserId,
    organizationId,
    action: "SUPPLIER_RESPONSE_WITHDRAWN",
    targetType: "SupplierResponse",
    targetId: existing.id,
    metadata: { rfqId },
  });

  return response;
}
