import type {
  CreatePurchaseOrderInput,
  MembershipRole,
  ProductUnit,
  PurchaseOrderListQuery,
  PurchaseOrderStatus,
} from "@market-hub/shared";
import { recordAudit } from "../../lib/audit";
import { AppError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { ROLE_RANK } from "../../middleware/organizationAuth";
import { formatRfqReference, getMembershipRole } from "./rfqs.service";

const PO_ITEM_SELECT = {
  id: true,
  rfqItemId: true,
  productId: true,
  itemName: true,
  specification: true,
  quantity: true,
  unit: true,
  unitPriceMinor: true,
  currency: true,
  lineTotalMinor: true,
  createdAt: true,
} as const;

const PO_SELECT = {
  id: true,
  sequenceNumber: true,
  awardId: true,
  rfqId: true,
  rfq: { select: { sequenceNumber: true, title: true } },
  responseId: true,
  buyerOrganizationId: true,
  buyerOrganizationName: true,
  supplierOrganizationId: true,
  supplierOrganizationName: true,
  createdByUserId: true,
  status: true,
  currency: true,
  subtotalMinor: true,
  totalMinor: true,
  totalQuantity: true,
  notes: true,
  submittedForApprovalAt: true,
  approvedAt: true,
  approvedByUserId: true,
  confirmedAt: true,
  confirmedByUserId: true,
  createdAt: true,
  updatedAt: true,
  items: { select: PO_ITEM_SELECT },
} as const;

const PO_LIST_SELECT = {
  id: true,
  sequenceNumber: true,
  rfqId: true,
  rfq: { select: { sequenceNumber: true, title: true } },
  status: true,
  currency: true,
  totalMinor: true,
  totalQuantity: true,
  buyerOrganizationName: true,
  supplierOrganizationName: true,
  createdAt: true,
  updatedAt: true,
} as const;

function formatPoReference(sequenceNumber: number): string {
  return `PO-${String(sequenceNumber).padStart(6, "0")}`;
}

/** Adds the PO's own reference plus the parent RFQ's reference/title,
 * flattened from the selected `rfq` relation (frontend display only:
 * select-only addition, no schema or business-rule change). */
function withPoReference<T extends { sequenceNumber: number; rfq: { sequenceNumber: number; title: string } }>(po: T) {
  const { rfq, ...rest } = po;
  return {
    ...rest,
    reference: formatPoReference(po.sequenceNumber),
    rfqReference: formatRfqReference(rfq.sequenceNumber),
    rfqTitle: rfq.title,
  };
}

/**
 * Centralized, explicit transition table (same discipline as Order/Rfq/
 * Negotiation) — DRAFT -> PENDING_APPROVAL -> APPROVED -> CONFIRMED, the
 * Phase 9 spec's recommended foundation, implemented literally. See
 * schema.prisma's PurchaseOrderStatus doc comment for why there is no
 * CANCELLED state.
 */
const PO_STATUS_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  DRAFT: ["PENDING_APPROVAL"],
  PENDING_APPROVAL: ["APPROVED"],
  APPROVED: ["CONFIRMED"],
  CONFIRMED: [],
};

/** Mirrors orders.service.ts's assertSellerAccess — a caller who is not a
 * member of the buyer organization (at all, or below minRole) gets the
 * identical 404 a nonexistent purchase order would give, never a 403 that
 * would confirm the PO exists. */
async function assertBuyerAccess(poId: string, userId: string, minRole: MembershipRole) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    select: { status: true, buyerOrganizationId: true, supplierOrganizationId: true },
  });
  if (!po) {
    throw AppError.notFound("Purchase order not found");
  }
  const role = await getMembershipRole(po.buyerOrganizationId, userId);
  if (!role || ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw AppError.notFound("Purchase order not found");
  }
  return po;
}

/** Mirrors assertBuyerAccess for the supplier side. Because
 * supplierOrganizationId is set once at PO creation directly from the
 * Award and never changes, a caller who passes this check is necessarily a
 * member of the actually-awarded supplier organization — there is no
 * separate "is this the awarded supplier" check to perform. */
async function assertSupplierAccess(poId: string, userId: string, minRole: MembershipRole) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    select: { status: true, buyerOrganizationId: true, supplierOrganizationId: true },
  });
  if (!po) {
    throw AppError.notFound("Purchase order not found");
  }
  const role = await getMembershipRole(po.supplierOrganizationId, userId);
  if (!role || ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw AppError.notFound("Purchase order not found");
  }
  return po;
}

async function transitionPurchaseOrder(
  poId: string,
  to: PurchaseOrderStatus,
  actorUserId: string,
  organizationId: string,
  auditAction: string,
  extraData: Record<string, unknown> = {}
) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, select: { status: true } });
  if (!po) {
    throw AppError.notFound("Purchase order not found");
  }
  if (!PO_STATUS_TRANSITIONS[po.status].includes(to)) {
    throw AppError.conflict(`Cannot move a purchase order from ${po.status} to ${to}`);
  }

  await prisma.purchaseOrder.update({ where: { id: poId }, data: { status: to, ...extraData } });

  await recordAudit({
    actorUserId,
    organizationId,
    action: auditAction,
    targetType: "PurchaseOrder",
    targetId: poId,
    metadata: { from: po.status, to },
  });

  // Re-read through getPurchaseOrderForViewer (not a raw re-select) so every
  // PO-returning endpoint has the exact same response shape, including
  // viewerRole — same discipline as orders.service.ts's transitionOrder.
  return getPurchaseOrderForViewer(poId, actorUserId);
}

/**
 * Creates a purchase order from an already-AWARDED RFQ's Award (Phase 9).
 * Every commercial value is resolved here, once, from the existing Phase 8
 * Award/SupplierResponse/Negotiation model — never from the client, never
 * rebuilt from the original RFQ price, and never from an arbitrary or
 * earlier negotiation event:
 *
 *  - If the awarded response has a negotiation and it is ACCEPTED, the
 *    final terms are the most recent NegotiationEvent's items (the offer
 *    that was actually accepted).
 *  - Otherwise (no negotiation, or it was CLOSED/declined), the final
 *    terms are the original SupplierResponseItem rows — the response the
 *    buyer awarded as-is.
 *
 * One PO per Award is enforced both here (pre-check, then a second check
 * inside the transaction to narrow the race window) and at the database
 * level (PurchaseOrder.awardId is @unique) — the same "service-layer
 * check backed by a DB constraint" pattern Award.rfqId/.responseId and
 * Negotiation.responseId already use.
 */
export async function createPurchaseOrderFromAward(
  organizationId: string,
  rfqId: string,
  actorUserId: string,
  input: CreatePurchaseOrderInput
) {
  const rfq = await prisma.rfq.findFirst({
    where: { id: rfqId, buyerOrganizationId: organizationId },
    select: { id: true, status: true, buyerOrganization: { select: { legalName: true } } },
  });
  if (!rfq) {
    throw AppError.notFound("RFQ not found");
  }
  if (rfq.status !== "AWARDED") {
    throw AppError.conflict(`Cannot create a purchase order for an RFQ in status ${rfq.status}`);
  }

  const award = await prisma.award.findUnique({
    where: { rfqId },
    select: { id: true, responseId: true, supplierOrganizationId: true },
  });
  if (!award) {
    // Should not happen if the RFQ is AWARDED (Award is created in the same
    // transaction as that transition) — defensive, not a reachable path.
    throw AppError.notFound("Award not found for this RFQ");
  }

  const existingPo = await prisma.purchaseOrder.findUnique({ where: { awardId: award.id }, select: { id: true } });
  if (existingPo) {
    throw AppError.conflict("A purchase order already exists for this award");
  }

  // Re-validate the response is still SUBMITTED at PO-creation time — do
  // not rely solely on the check awardRfq already performed when the
  // Award was created; nothing currently prevents a response from being
  // withdrawn afterwards (supplierResponses.service.ts's
  // withdrawSupplierResponse has no RFQ/award-aware guard), so this is a
  // real, reachable rejection path, not paranoia.
  const response = await prisma.supplierResponse.findUnique({
    where: { id: award.responseId },
    select: {
      id: true,
      status: true,
      items: { select: { rfqItemId: true, quantity: true, unit: true, unitPriceMinor: true, currency: true } },
    },
  });
  if (!response || response.status !== "SUBMITTED") {
    throw AppError.conflict("The awarded supplier response is no longer in a valid SUBMITTED state");
  }

  const supplierOrg = await prisma.organization.findUnique({
    where: { id: award.supplierOrganizationId },
    select: { id: true, legalName: true, status: true, supplierProfile: { select: { isActive: true } } },
  });
  if (!supplierOrg || supplierOrg.status !== "ACTIVE" || !supplierOrg.supplierProfile?.isActive) {
    throw AppError.conflict("The awarded supplier organization is no longer a valid, active supplier");
  }

  const negotiation = await prisma.negotiation.findUnique({
    where: { responseId: award.responseId },
    select: { id: true, status: true },
  });

  let sourceItems: { rfqItemId: string; quantity: number; unit: ProductUnit; unitPriceMinor: number; currency: string }[];
  if (negotiation && negotiation.status === "ACCEPTED") {
    const lastEvent = await prisma.negotiationEvent.findFirst({
      where: { negotiationId: negotiation.id },
      orderBy: { createdAt: "desc" },
      select: {
        items: { select: { rfqItemId: true, quantity: true, unit: true, unitPriceMinor: true, currency: true } },
      },
    });
    if (!lastEvent || lastEvent.items.length === 0) {
      throw AppError.internal("Accepted negotiation has no offer to resolve final terms from");
    }
    sourceItems = lastEvent.items;
  } else {
    sourceItems = response.items;
  }

  const currencies = new Set(sourceItems.map((item) => item.currency));
  if (currencies.size !== 1) {
    throw AppError.conflict("Awarded items carry more than one currency — cannot create a single purchase order");
  }
  const currency = sourceItems[0]!.currency;

  const rfqItems = await prisma.rfqItem.findMany({
    where: { id: { in: sourceItems.map((item) => item.rfqItemId) } },
    select: { id: true, itemName: true, specification: true, productId: true },
  });
  const rfqItemById = new Map(rfqItems.map((item) => [item.id, item]));

  const itemsData = sourceItems.map((item) => {
    const rfqItem = rfqItemById.get(item.rfqItemId);
    return {
      rfqItemId: item.rfqItemId,
      productId: rfqItem?.productId ?? null,
      itemName: rfqItem?.itemName ?? "Item",
      specification: rfqItem?.specification ?? null,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceMinor: item.unitPriceMinor,
      currency: item.currency,
      lineTotalMinor: item.quantity * item.unitPriceMinor,
    };
  });
  const subtotalMinor = itemsData.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const totalQuantity = itemsData.reduce((sum, item) => sum + item.quantity, 0);

  const po = await prisma.$transaction(async (tx) => {
    const raceCheck = await tx.purchaseOrder.findUnique({ where: { awardId: award.id }, select: { id: true } });
    if (raceCheck) {
      throw AppError.conflict("A purchase order already exists for this award");
    }

    return tx.purchaseOrder.create({
      data: {
        awardId: award.id,
        rfqId,
        responseId: award.responseId,
        buyerOrganizationId: organizationId,
        buyerOrganizationName: rfq.buyerOrganization.legalName,
        supplierOrganizationId: award.supplierOrganizationId,
        supplierOrganizationName: supplierOrg.legalName,
        createdByUserId: actorUserId,
        currency,
        subtotalMinor,
        totalMinor: subtotalMinor,
        totalQuantity,
        notes: input.notes,
        items: { create: itemsData },
      },
      select: PO_SELECT,
    });
  });

  await recordAudit({
    actorUserId,
    organizationId,
    action: "PO_CREATED",
    targetType: "PurchaseOrder",
    targetId: po.id,
    metadata: { awardId: award.id, rfqId, supplierOrganizationId: award.supplierOrganizationId, subtotalMinor, currency },
  });

  return withPoReference(po);
}

/**
 * Resolves the caller's relationship to one purchase order without
 * requiring an :organizationId in the URL — a PO spans two organizations'
 * worth of access, same as Order/Rfq/Negotiation. A caller who is neither
 * the buyer nor the supplier gets the identical 404 a nonexistent PO would.
 */
export async function getPurchaseOrderForViewer(poId: string, viewerUserId: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, select: PO_SELECT });
  if (!po) {
    throw AppError.notFound("Purchase order not found");
  }

  const buyerRole = await getMembershipRole(po.buyerOrganizationId, viewerUserId);
  if (buyerRole && ROLE_RANK[buyerRole] >= ROLE_RANK.STAFF) {
    return { ...withPoReference(po), viewerRole: "buyer" as const };
  }

  const supplierRole = await getMembershipRole(po.supplierOrganizationId, viewerUserId);
  if (supplierRole && ROLE_RANK[supplierRole] >= ROLE_RANK.STAFF) {
    return { ...withPoReference(po), viewerRole: "supplier" as const };
  }

  throw AppError.notFound("Purchase order not found");
}

export async function listBuyerPurchaseOrders(organizationId: string, query: PurchaseOrderListQuery) {
  const where = { buyerOrganizationId: organizationId, ...(query.status ? { status: query.status } : {}) };
  const [purchaseOrders, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      select: PO_LIST_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);
  return { purchaseOrders: purchaseOrders.map(withPoReference), page: query.page, pageSize: query.pageSize, total };
}

export async function listSupplierPurchaseOrders(organizationId: string, query: PurchaseOrderListQuery) {
  const where = { supplierOrganizationId: organizationId, ...(query.status ? { status: query.status } : {}) };
  const [purchaseOrders, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      select: PO_LIST_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);
  return { purchaseOrders: purchaseOrders.map(withPoReference), page: query.page, pageSize: query.pageSize, total };
}

/** DRAFT -> PENDING_APPROVAL, buyer MANAGER+ (same bar as issuing an RFQ
 * or awarding one — Phase 9 spec: "MANAGER+ can create PO, submit for
 * approval, and approve"). */
export async function submitPurchaseOrderForApproval(poId: string, actorUserId: string) {
  const po = await assertBuyerAccess(poId, actorUserId, "MANAGER");
  return transitionPurchaseOrder(poId, "PENDING_APPROVAL", actorUserId, po.buyerOrganizationId, "PO_SUBMITTED_FOR_APPROVAL", {
    submittedForApprovalAt: new Date(),
  });
}

/** PENDING_APPROVAL -> APPROVED, buyer MANAGER+. */
export async function approvePurchaseOrder(poId: string, actorUserId: string) {
  const po = await assertBuyerAccess(poId, actorUserId, "MANAGER");
  return transitionPurchaseOrder(poId, "APPROVED", actorUserId, po.buyerOrganizationId, "PO_APPROVED", {
    approvedAt: new Date(),
    approvedByUserId: actorUserId,
  });
}

/** APPROVED -> CONFIRMED, supplier MANAGER+ (same bar as accepting/
 * declining a negotiation on the supplier side). Because
 * supplierOrganizationId is fixed at creation from the Award, passing
 * assertSupplierAccess already proves the caller belongs to the actually-
 * awarded supplier — see that function's doc comment. */
export async function confirmPurchaseOrder(poId: string, actorUserId: string) {
  const po = await assertSupplierAccess(poId, actorUserId, "MANAGER");
  return transitionPurchaseOrder(poId, "CONFIRMED", actorUserId, po.supplierOrganizationId, "PO_CONFIRMED", {
    confirmedAt: new Date(),
    confirmedByUserId: actorUserId,
  });
}
