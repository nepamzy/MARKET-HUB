import type { AwardRfqInput, CreateRfqInput, MembershipRole, RfqListQuery, RfqStatus } from "@market-hub/shared";
import { recordAudit } from "../../lib/audit";
import { AppError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { ROLE_RANK } from "../../middleware/organizationAuth";

const RFQ_ITEM_SELECT = {
  id: true,
  requisitionItemId: true,
  productId: true,
  itemName: true,
  specification: true,
  quantity: true,
  unit: true,
  createdAt: true,
} as const;

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

// Award is buyer-visible in full (it's the buyer's own decision); a
// losing supplier never sees who won through this select — see
// getRfqForViewer's supplier branch, which instead computes a plain
// boolean against its own response only (Phase 8 §7: never leak
// competitive information the existing Phase 7 privacy model wouldn't).
const AWARD_SELECT = {
  id: true,
  responseId: true,
  supplierOrganizationId: true,
  supplierOrganization: { select: { id: true, legalName: true } },
  awardedByUserId: true,
  reason: true,
  createdAt: true,
} as const;

// Full detail for the buyer: every target (so the buyer can see who hasn't
// responded yet, Phase 7 §16/§19 "manage supplier targets") and every
// SUBMITTED/WITHDRAWN response (never a competing supplier's DRAFT, which
// is that supplier's own private in-progress work — Phase 7 §12).
const RFQ_BUYER_SELECT = {
  id: true,
  sequenceNumber: true,
  buyerOrganizationId: true,
  requisitionId: true,
  createdByUserId: true,
  title: true,
  description: true,
  status: true,
  responseDeadline: true,
  issuedAt: true,
  createdAt: true,
  updatedAt: true,
  items: { select: RFQ_ITEM_SELECT },
  targets: {
    select: {
      id: true,
      supplierOrganizationId: true,
      supplierOrganization: { select: { id: true, legalName: true } },
      status: true,
      invitedAt: true,
      respondedAt: true,
    },
  },
  responses: {
    where: { status: { in: ["SUBMITTED", "WITHDRAWN"] as ("SUBMITTED" | "WITHDRAWN")[] } },
    select: {
      id: true,
      supplierOrganizationId: true,
      supplierOrganization: { select: { id: true, legalName: true } },
      status: true,
      notes: true,
      submittedAt: true,
      withdrawnAt: true,
      items: { select: RESPONSE_ITEM_SELECT },
    },
  },
  award: { select: AWARD_SELECT },
  // Lets the buyer's RFQ detail page link straight to "create" or "view"
  // the purchase order without a separate lookup (Phase 9). Minimal select
  // — the PO detail endpoint is the source of truth for everything else.
  purchaseOrder: { select: { id: true, status: true } },
} as const;

// What a targeted supplier may see: the RFQ's own content, never any other
// supplier's target row or response (Phase 7 §16: "A supplier should not
// automatically gain access to unrelated buyer information", read together
// with "unrelated information" meaning other suppliers' competitive data).
const RFQ_SUPPLIER_SELECT = {
  id: true,
  sequenceNumber: true,
  buyerOrganizationId: true,
  // Phase 7 frontend pass: additive select, no schema change. A targeted
  // supplier previously had no way to see WHICH organization sent the RFQ
  // at all — only an opaque buyerOrganizationId — found while reviewing
  // the existing supplier-facing detail page, which never rendered any
  // buyer identity. Legal name only, same minimal shape already used for
  // supplierOrganization elsewhere in this file.
  buyerOrganization: { select: { id: true, legalName: true } },
  requisitionId: true,
  title: true,
  description: true,
  status: true,
  responseDeadline: true,
  issuedAt: true,
  createdAt: true,
  updatedAt: true,
  items: { select: RFQ_ITEM_SELECT },
  // Safe to expose: at most one PO can ever exist per RFQ (Award.rfqId is
  // @unique, PurchaseOrder.awardId is @unique), and a supplier only reaches
  // this branch at all once it is a confirmed party — see getRfqForViewer.
  purchaseOrder: { select: { id: true, status: true } },
} as const;

const RFQ_LIST_SELECT = {
  id: true,
  sequenceNumber: true,
  title: true,
  status: true,
  responseDeadline: true,
  issuedAt: true,
  createdAt: true,
  _count: { select: { targets: true, responses: true } },
} as const;

// Exported for negotiations.service.ts, which needs the identical
// RFQ-reference formatting to surface the parent RFQ's reference on a
// negotiation — reused rather than duplicated.
export function formatRfqReference(sequenceNumber: number): string {
  return `RFQ-${String(sequenceNumber).padStart(6, "0")}`;
}

function withRfqReference<T extends { sequenceNumber: number }>(rfq: T) {
  return { ...rfq, reference: formatRfqReference(rfq.sequenceNumber) };
}

// Exported for negotiations.service.ts, which needs the identical
// (organizationId, userId) -> role lookup for its own buyer/supplier side
// resolution — reused rather than duplicated.
export async function getMembershipRole(organizationId: string, userId: string): Promise<MembershipRole | null> {
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true },
  });
  return membership?.role ?? null;
}

/**
 * Centralized, explicit transition table (Phase 8 §4's discipline,
 * extended to RfqStatus itself) — DRAFT -> ISSUED -> AWARDED, both
 * terminal-on-the-way-in checks (issueRfq, awardRfq) now read this
 * instead of an inline literal comparison, matching Order/Requisition/
 * Negotiation's own tables.
 */
const RFQ_STATUS_TRANSITIONS: Record<RfqStatus, RfqStatus[]> = {
  DRAFT: ["ISSUED"],
  ISSUED: ["AWARDED"],
  AWARDED: [],
};

async function assertRfqOwnership(organizationId: string, rfqId: string) {
  const rfq = await prisma.rfq.findFirst({
    where: { id: rfqId, buyerOrganizationId: organizationId },
    select: { id: true, status: true },
  });
  if (!rfq) {
    throw AppError.notFound("RFQ not found");
  }
  return rfq;
}

/**
 * Validates that every id is a real, ACTIVE organization with an active
 * SupplierProfile (Phase 7 §11/§28: reuse the existing supplier/directory
 * foundation rather than inventing a second supplier concept). Does NOT
 * require isDiscoverable — a buyer directly naming a known supplier by ID
 * is a different action from browsing the public directory, and Phase 3's
 * discoverability toggle governs the latter, not this.
 */
async function assertValidSupplierOrganizations(organizationIds: string[]): Promise<void> {
  const suppliers = await prisma.organization.findMany({
    where: { id: { in: organizationIds }, status: "ACTIVE", supplierProfile: { isActive: true } },
    select: { id: true },
  });
  const validIds = new Set(suppliers.map((s) => s.id));
  const invalid = organizationIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) {
    throw AppError.badRequest("One or more organizations are not valid, active suppliers", {
      invalidSupplierOrganizationIds: invalid,
    });
  }
}

/**
 * Creates an RFQ from an already-SUBMITTED requisition (Phase 7 §9/§20).
 * RFQ items are a snapshot COPY of the requisition's items, never buyer-
 * supplied directly — see RfqItem's schema doc comment for why this is
 * what makes post-issuance immutability trivially true. The whole operation
 * — RFQ, its items, its supplier targets, and the requisition's own
 * RFQ_CREATED transition — is one transaction (Phase 7 §20: never an
 * orphaned RFQ or an RFQ without valid requisition ownership). Requiring
 * the requisition to still be SUBMITTED (not already RFQ_CREATED) is also
 * this operation's idempotency guard (Phase 7 §21): a duplicate submission
 * of the same "create RFQ" request sees RFQ_CREATED and is rejected with a
 * 409, never a second RFQ.
 */
export async function createRfq(organizationId: string, actorUserId: string, input: CreateRfqInput) {
  const requisition = await prisma.requisition.findFirst({
    where: { id: input.requisitionId, buyerOrganizationId: organizationId },
    select: {
      id: true,
      status: true,
      items: { select: { id: true, productId: true, itemName: true, specification: true, quantity: true, unit: true } },
    },
  });
  if (!requisition) {
    throw AppError.notFound("Requisition not found");
  }
  if (requisition.status !== "SUBMITTED") {
    throw AppError.conflict(`Cannot create an RFQ from a requisition in status ${requisition.status}`);
  }

  await assertValidSupplierOrganizations(input.supplierOrganizationIds);

  const rfq = await prisma.$transaction(async (tx) => {
    const created = await tx.rfq.create({
      data: {
        buyerOrganizationId: organizationId,
        requisitionId: requisition.id,
        createdByUserId: actorUserId,
        title: input.title,
        description: input.description,
        responseDeadline: input.responseDeadline,
        items: {
          create: requisition.items.map((item) => ({
            requisitionItemId: item.id,
            productId: item.productId,
            itemName: item.itemName,
            specification: item.specification,
            quantity: item.quantity,
            unit: item.unit,
          })),
        },
        targets: { create: input.supplierOrganizationIds.map((supplierOrganizationId) => ({ supplierOrganizationId })) },
      },
      select: RFQ_BUYER_SELECT,
    });

    await tx.requisition.update({ where: { id: requisition.id }, data: { status: "RFQ_CREATED" } });

    return created;
  });

  await recordAudit({
    actorUserId,
    organizationId,
    action: "RFQ_CREATED",
    targetType: "Rfq",
    targetId: rfq.id,
    metadata: { requisitionId: requisition.id, supplierCount: input.supplierOrganizationIds.length },
  });

  return withRfqReference(rfq);
}

/** DRAFT -> ISSUED only (Phase 7 §9/§19) — the point at which targeted
 * suppliers gain visibility and may respond. See RfqStatus's doc comment
 * for why there is no further transition in this phase. */
export async function issueRfq(organizationId: string, rfqId: string, actorUserId: string) {
  const existing = await assertRfqOwnership(organizationId, rfqId);
  if (!RFQ_STATUS_TRANSITIONS[existing.status].includes("ISSUED")) {
    throw AppError.conflict(`Cannot issue an RFQ in status ${existing.status}`);
  }

  const rfq = await prisma.rfq.update({
    where: { id: rfqId },
    data: { status: "ISSUED", issuedAt: new Date() },
    select: RFQ_BUYER_SELECT,
  });

  await recordAudit({ actorUserId, organizationId, action: "RFQ_ISSUED", targetType: "Rfq", targetId: rfqId });

  return withRfqReference(rfq);
}

/**
 * Adds further supplier targets to an RFQ. Already-targeted suppliers are
 * silently skipped rather than erroring (Phase 7 §21 idempotency: a repeated
 * invite of the same supplier must not fail or create a duplicate row —
 * the unique (rfqId, supplierOrganizationId) constraint backs this too).
 */
export async function addRfqSupplierTargets(
  organizationId: string,
  rfqId: string,
  actorUserId: string,
  supplierOrganizationIds: string[]
) {
  await assertRfqOwnership(organizationId, rfqId);
  await assertValidSupplierOrganizations(supplierOrganizationIds);

  const existing = await prisma.rfqSupplierTarget.findMany({
    where: { rfqId, supplierOrganizationId: { in: supplierOrganizationIds } },
    select: { supplierOrganizationId: true },
  });
  const alreadyTargeted = new Set(existing.map((t) => t.supplierOrganizationId));
  const toAdd = supplierOrganizationIds.filter((id) => !alreadyTargeted.has(id));

  if (toAdd.length > 0) {
    await prisma.rfqSupplierTarget.createMany({
      data: toAdd.map((supplierOrganizationId) => ({ rfqId, supplierOrganizationId })),
    });

    await recordAudit({
      actorUserId,
      organizationId,
      action: "RFQ_SUPPLIER_INVITED",
      targetType: "Rfq",
      targetId: rfqId,
      metadata: { supplierOrganizationIds: toAdd },
    });
  }

  const rfq = await prisma.rfq.findUniqueOrThrow({ where: { id: rfqId }, select: RFQ_BUYER_SELECT });
  return withRfqReference(rfq);
}

export async function listBuyerRfqs(organizationId: string, query: RfqListQuery) {
  const where = {
    buyerOrganizationId: organizationId,
    ...(query.status ? { status: query.status } : {}),
  };

  const [rfqs, total] = await Promise.all([
    prisma.rfq.findMany({
      where,
      select: RFQ_LIST_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.rfq.count({ where }),
  ]);

  return { rfqs: rfqs.map(withRfqReference), page: query.page, pageSize: query.pageSize, total };
}

/**
 * Lists the RFQs targeting one supplier organization ("RFQ inbox",
 * Phase 7 §23). Only ISSUED RFQs appear — a DRAFT RFQ is still buyer-
 * private even though a target row for it may already exist (Phase 7
 * §18: never expose buyer procurement requirements before issuance).
 */
export async function listRfqInbox(organizationId: string, query: RfqListQuery) {
  const where = {
    supplierOrganizationId: organizationId,
    rfq: { status: "ISSUED" as const },
  };

  const [targets, total] = await Promise.all([
    prisma.rfqSupplierTarget.findMany({
      where,
      select: {
        id: true,
        status: true,
        invitedAt: true,
        respondedAt: true,
        rfq: { select: RFQ_LIST_SELECT },
      },
      orderBy: { invitedAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.rfqSupplierTarget.count({ where }),
  ]);

  return {
    targets: targets.map((t) => ({ ...t, rfq: withRfqReference(t.rfq) })),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

/**
 * Resolves the caller's relationship to one RFQ without requiring an
 * :organizationId in the URL (mirrors orders.service.ts's
 * getOrderForViewer — an RFQ, like an Order, spans two organizations'
 * worth of access). A caller who is neither the buyer nor a targeted
 * supplier gets the identical 404 a nonexistent RFQ would (Phase 7 §16).
 * A targeted supplier for a still-DRAFT RFQ also gets 404 — targeting
 * alone does not grant visibility before issuance.
 */
export async function getRfqForViewer(rfqId: string, viewerUserId: string) {
  const base = await prisma.rfq.findUnique({ where: { id: rfqId }, select: { buyerOrganizationId: true, status: true } });
  if (!base) {
    throw AppError.notFound("RFQ not found");
  }

  const buyerRole = await getMembershipRole(base.buyerOrganizationId, viewerUserId);
  if (buyerRole && ROLE_RANK[buyerRole] >= ROLE_RANK.STAFF) {
    const rfq = await prisma.rfq.findUniqueOrThrow({ where: { id: rfqId }, select: RFQ_BUYER_SELECT });
    return { ...withRfqReference(rfq), viewerRole: "buyer" as const, viewerSupplierOrganizationId: null };
  }

  const targets = await prisma.rfqSupplierTarget.findMany({ where: { rfqId }, select: { supplierOrganizationId: true } });
  for (const target of targets) {
    const supplierRole = await getMembershipRole(target.supplierOrganizationId, viewerUserId);
    if (supplierRole && ROLE_RANK[supplierRole] >= ROLE_RANK.STAFF && base.status !== "DRAFT") {
      const rfq = await prisma.rfq.findUniqueOrThrow({ where: { id: rfqId }, select: RFQ_SUPPLIER_SELECT });
      const ownTarget = await prisma.rfqSupplierTarget.findUniqueOrThrow({
        where: { rfqId_supplierOrganizationId: { rfqId, supplierOrganizationId: target.supplierOrganizationId } },
        select: { status: true, invitedAt: true, respondedAt: true },
      });
      const ownResponse = await prisma.supplierResponse.findUnique({
        where: { rfqId_supplierOrganizationId: { rfqId, supplierOrganizationId: target.supplierOrganizationId } },
        select: {
          id: true,
          status: true,
          notes: true,
          submittedAt: true,
          withdrawnAt: true,
          items: { select: RESPONSE_ITEM_SELECT },
        },
      });

      // A losing supplier must never learn WHO won (Phase 8 §7 extends
      // Phase 7's "never leak another supplier's existence/data") — only
      // whether its own response was the one awarded, once the RFQ
      // actually is AWARDED. null means "not decided yet," never a guess.
      let youWereAwarded: boolean | null = null;
      if (base.status === "AWARDED") {
        const award = await prisma.award.findUnique({ where: { rfqId }, select: { responseId: true } });
        youWereAwarded = award ? award.responseId === ownResponse?.id : false;
      }

      // Lets the frontend link straight to "your negotiation" without a
      // separate list call — own response only, never another supplier's.
      const ownNegotiation = ownResponse
        ? await prisma.negotiation.findUnique({ where: { responseId: ownResponse.id }, select: { id: true, status: true } })
        : null;

      return {
        ...withRfqReference(rfq),
        viewerRole: "supplier" as const,
        viewerSupplierOrganizationId: target.supplierOrganizationId,
        target: ownTarget,
        response: ownResponse,
        youWereAwarded,
        negotiation: ownNegotiation,
      };
    }
  }

  throw AppError.notFound("RFQ not found");
}

// --- Phase 8: Comparison & Award ----------------------------------------

const COMPARISON_RESPONSE_SELECT = {
  id: true,
  supplierOrganizationId: true,
  supplierOrganization: { select: { id: true, legalName: true } },
  status: true,
  notes: true,
  submittedAt: true,
  withdrawnAt: true,
  items: { select: RESPONSE_ITEM_SELECT },
} as const;

/**
 * Buyer-side structured comparison of every SUBMITTED/WITHDRAWN response
 * to an RFQ (Phase 8 §2) — built entirely from persisted SupplierResponse/
 * SupplierResponseItem rows, never mock or computed data. Each response
 * carries its own currency and item-level prices exactly as submitted;
 * this function performs no cross-response arithmetic and no currency
 * conversion (Phase 8 §2: "do not perform cross-currency arithmetic...
 * preserve the currencies explicitly"). A response's negotiation summary
 * (if one exists) is attached so the buyer can see at a glance whether a
 * quote is still being negotiated before deciding — not a ranking, not a
 * "best" flag, just the persisted facts side by side.
 */
export async function getRfqComparison(organizationId: string, rfqId: string) {
  await assertRfqOwnership(organizationId, rfqId);

  const rfq = await prisma.rfq.findUniqueOrThrow({
    where: { id: rfqId },
    select: {
      id: true,
      sequenceNumber: true,
      title: true,
      status: true,
      items: { select: RFQ_ITEM_SELECT },
      responses: {
        where: { status: { in: ["SUBMITTED", "WITHDRAWN"] as ("SUBMITTED" | "WITHDRAWN")[] } },
        select: COMPARISON_RESPONSE_SELECT,
      },
      // Phase 8 frontend pass: additive select, no schema change. Once an
      // RFQ is AWARDED, the comparison view previously had no way to tell
      // the buyer WHICH response won — only the RFQ's own AWARDED badge,
      // with every response still rendered identically. Reuses the same
      // AWARD_SELECT already exposed on RFQ_BUYER_SELECT.
      award: { select: AWARD_SELECT },
    },
  });

  const negotiations = await prisma.negotiation.findMany({
    where: { responseId: { in: rfq.responses.map((r) => r.id) } },
    select: { id: true, responseId: true, status: true, updatedAt: true },
  });
  const negotiationByResponse = new Map(negotiations.map((n) => [n.responseId, n]));

  return {
    ...withRfqReference(rfq),
    responses: rfq.responses.map((response) => ({
      ...response,
      negotiation: negotiationByResponse.get(response.id) ?? null,
    })),
  };
}

/**
 * Awards the RFQ to one supplier's SUBMITTED response (Phase 8 §5). The
 * response must still belong to this RFQ and be SUBMITTED; an OPEN
 * negotiation for it must be resolved first ("only after the required
 * procurement workflow has been satisfied," §5) — resolving means ACCEPT
 * or DECLINE, not simply ignoring it. RFQ transitions to AWARDED in the
 * same transaction as the Award row, which is also this operation's
 * duplicate-command guard (Phase 8 §4/§12): a second award attempt sees
 * RFQ_STATUS_TRANSITIONS[AWARDED] is empty and gets 409 before ever
 * reaching the database write — backed at the DB level by Award.rfqId's
 * own unique constraint as well.
 */
export async function awardRfq(organizationId: string, rfqId: string, actorUserId: string, input: AwardRfqInput) {
  const rfq = await assertRfqOwnership(organizationId, rfqId);
  if (!RFQ_STATUS_TRANSITIONS[rfq.status].includes("AWARDED")) {
    throw AppError.conflict(`Cannot award an RFQ in status ${rfq.status}`);
  }

  const response = await prisma.supplierResponse.findFirst({
    where: { id: input.responseId, rfqId, status: "SUBMITTED" },
    select: { id: true, supplierOrganizationId: true },
  });
  if (!response) {
    throw AppError.badRequest("The selected response is not a valid, submitted response to this RFQ");
  }

  const openNegotiation = await prisma.negotiation.findFirst({
    where: { responseId: response.id, status: "OPEN" },
    select: { id: true },
  });
  if (openNegotiation) {
    throw AppError.conflict("Resolve the open negotiation for this response (accept or decline it) before awarding it");
  }

  const award = await prisma.$transaction(async (tx) => {
    const created = await tx.award.create({
      data: {
        rfqId,
        responseId: response.id,
        supplierOrganizationId: response.supplierOrganizationId,
        awardedByUserId: actorUserId,
        reason: input.reason,
      },
      select: AWARD_SELECT,
    });
    await tx.rfq.update({ where: { id: rfqId }, data: { status: "AWARDED" } });
    return created;
  });

  await recordAudit({
    actorUserId,
    organizationId,
    action: "AWARD_CREATED",
    targetType: "Award",
    targetId: award.id,
    metadata: { rfqId, responseId: response.id, supplierOrganizationId: response.supplierOrganizationId },
  });

  return award;
}
