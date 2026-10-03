import type { CreateNegotiationInput, MembershipRole, NegotiationStatus, RespondToNegotiationInput } from "@market-hub/shared";
import { recordAudit } from "../../lib/audit";
import { AppError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { ROLE_RANK } from "../../middleware/organizationAuth";
import { getMembershipRole } from "./rfqs.service";

const NEGOTIATION_EVENT_ITEM_SELECT = {
  id: true,
  rfqItemId: true,
  quantity: true,
  unit: true,
  unitPriceMinor: true,
  currency: true,
  notes: true,
} as const;

const NEGOTIATION_EVENT_SELECT = {
  id: true,
  authorRole: true,
  actorUserId: true,
  message: true,
  createdAt: true,
  items: { select: NEGOTIATION_EVENT_ITEM_SELECT },
} as const;

const NEGOTIATION_SELECT = {
  id: true,
  rfqId: true,
  responseId: true,
  buyerOrganizationId: true,
  supplierOrganizationId: true,
  openedByUserId: true,
  status: true,
  closedAt: true,
  closeReason: true,
  createdAt: true,
  updatedAt: true,
  events: { select: NEGOTIATION_EVENT_SELECT, orderBy: { createdAt: "asc" } },
} as const;

/**
 * Centralized, explicit transition table (Phase 8 §4), same discipline as
 * Order/Requisition/Rfq — OPEN is the only non-terminal state; ACCEPTED
 * and CLOSED both end the negotiation permanently (no reopening,
 * no resubmission, matching NegotiationStatus's schema doc comment).
 */
const NEGOTIATION_STATUS_TRANSITIONS: Record<NegotiationStatus, NegotiationStatus[]> = {
  OPEN: ["ACCEPTED", "CLOSED"],
  ACCEPTED: [],
  CLOSED: [],
};

/** Every negotiation item must map to a real line on the RFQ being
 * negotiated — never a client-supplied arbitrary reference (same
 * discipline as supplierResponses.service.ts's identical check). */
function assertItemsMapToRfq(validRfqItemIds: Set<string>, items: { rfqItemId: string }[]) {
  const invalid = items.filter((item) => !validRfqItemIds.has(item.rfqItemId)).map((item) => item.rfqItemId);
  if (invalid.length > 0) {
    throw AppError.badRequest("One or more negotiation items do not map to a valid RFQ item", {
      invalidRfqItemIds: invalid,
    });
  }
}

interface NegotiationSides {
  buyerOrganizationId: string;
  supplierOrganizationId: string;
}

/**
 * Resolves which side of a negotiation the caller is acting as, purely
 * from the negotiation's own denormalized org IDs — never from a
 * client-supplied organization ID (Phase 8 §9/§7). A caller who belongs
 * to neither side gets the same 404 a nonexistent negotiation would
 * (Phase 7's established anti-enumeration discipline, extended here).
 * `minRole` lets GET (STAFF+) and action endpoints (MANAGER+) share this
 * one resolution function: a legitimate party under the role bar gets a
 * 403 ("you ARE a party, just not privileged enough"), not a 404.
 */
async function resolveNegotiationSide(
  sides: NegotiationSides,
  userId: string,
  minRole: MembershipRole
): Promise<"buyer" | "supplier"> {
  const buyerRole = await getMembershipRole(sides.buyerOrganizationId, userId);
  if (buyerRole) {
    if (ROLE_RANK[buyerRole] < ROLE_RANK[minRole]) {
      throw AppError.forbidden("Your role does not permit this action");
    }
    return "buyer";
  }

  const supplierRole = await getMembershipRole(sides.supplierOrganizationId, userId);
  if (supplierRole) {
    if (ROLE_RANK[supplierRole] < ROLE_RANK[minRole]) {
      throw AppError.forbidden("Your role does not permit this action");
    }
    return "supplier";
  }

  throw AppError.notFound("Negotiation not found");
}

/**
 * Opens a negotiation against an already-SUBMITTED supplier response
 * (Phase 8 §3) — always buyer-initiated, always carries the first
 * counter-offer in the same transaction, so there is never a negotiation
 * with zero events. `@unique` on Negotiation.responseId is this
 * operation's idempotency guard (Phase 8 §4/§12): a duplicate "open
 * negotiation" request for the same response is rejected with 409, never
 * a second thread.
 */
export async function createNegotiation(
  buyerOrganizationId: string,
  rfqId: string,
  actorUserId: string,
  input: CreateNegotiationInput
) {
  const rfq = await prisma.rfq.findFirst({
    where: { id: rfqId, buyerOrganizationId },
    select: { id: true, status: true },
  });
  if (!rfq) {
    throw AppError.notFound("RFQ not found");
  }
  if (rfq.status !== "ISSUED") {
    throw AppError.conflict(`Cannot open a negotiation on an RFQ in status ${rfq.status}`);
  }

  const response = await prisma.supplierResponse.findFirst({
    where: { id: input.responseId, rfqId, status: "SUBMITTED" },
    select: { id: true, supplierOrganizationId: true },
  });
  if (!response) {
    throw AppError.badRequest("The selected response is not a valid, submitted response to this RFQ");
  }

  const existing = await prisma.negotiation.findUnique({ where: { responseId: response.id }, select: { id: true } });
  if (existing) {
    throw AppError.conflict("A negotiation already exists for this response");
  }

  const validRfqItemIds = new Set((await prisma.rfqItem.findMany({ where: { rfqId }, select: { id: true } })).map((i) => i.id));
  assertItemsMapToRfq(validRfqItemIds, input.items);

  const negotiation = await prisma.negotiation.create({
    data: {
      rfqId,
      responseId: response.id,
      buyerOrganizationId,
      supplierOrganizationId: response.supplierOrganizationId,
      openedByUserId: actorUserId,
      events: {
        create: {
          authorRole: "BUYER",
          actorUserId,
          message: input.message,
          items: { create: input.items },
        },
      },
    },
    select: NEGOTIATION_SELECT,
  });

  await recordAudit({
    actorUserId,
    organizationId: buyerOrganizationId,
    action: "NEGOTIATION_CREATED",
    targetType: "Negotiation",
    targetId: negotiation.id,
    metadata: { rfqId, responseId: response.id },
  });
  await recordAudit({
    actorUserId,
    organizationId: buyerOrganizationId,
    action: "NEGOTIATION_COUNTER_OFFER_CREATED",
    targetType: "Negotiation",
    targetId: negotiation.id,
    metadata: { authorRole: "BUYER" },
  });

  return { ...negotiation, viewerRole: "buyer" as const };
}

/**
 * Resolves the caller's relationship to one negotiation without requiring
 * an :organizationId in the URL (mirrors getRfqForViewer/getOrderForViewer
 * — a negotiation spans two organizations' worth of access). Read access
 * is STAFF+ on either side (Phase 8 §7: "STAFF may read where
 * appropriate"); a non-party gets the identical 404 a nonexistent
 * negotiation would.
 */
export async function getNegotiationForViewer(negotiationId: string, viewerUserId: string) {
  const negotiation = await prisma.negotiation.findUnique({ where: { id: negotiationId }, select: NEGOTIATION_SELECT });
  if (!negotiation) {
    throw AppError.notFound("Negotiation not found");
  }

  const side = await resolveNegotiationSide(negotiation, viewerUserId, "STAFF");
  return { ...negotiation, viewerRole: side };
}

/**
 * Responds to an open negotiation (Phase 8 §3/§4) — COUNTER creates a new
 * append-only event from the caller's side; ACCEPT/DECLINE transition the
 * negotiation to a terminal state. Turn-alternation (the caller's side
 * must differ from the most recent event's author) prevents one side from
 * negotiating against itself and doubles as duplicate-command protection
 * (Phase 8 §4/§12): resubmitting the same counter-offer twice in a row is
 * rejected with 409 on the second attempt, since by then the caller IS
 * the most recent author. Blocked entirely once the RFQ has been AWARDED
 * — continuing to negotiate a lost (or already-decided) RFQ is meaningless.
 */
export async function respondToNegotiation(negotiationId: string, actorUserId: string, input: RespondToNegotiationInput) {
  const negotiation = await prisma.negotiation.findUnique({
    where: { id: negotiationId },
    select: {
      id: true,
      rfqId: true,
      buyerOrganizationId: true,
      supplierOrganizationId: true,
      status: true,
      events: { select: { authorRole: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!negotiation) {
    throw AppError.notFound("Negotiation not found");
  }

  const side = await resolveNegotiationSide(negotiation, actorUserId, "MANAGER");
  const organizationId = side === "buyer" ? negotiation.buyerOrganizationId : negotiation.supplierOrganizationId;

  const rfq = await prisma.rfq.findUniqueOrThrow({ where: { id: negotiation.rfqId }, select: { status: true } });
  if (rfq.status === "AWARDED") {
    throw AppError.conflict("This RFQ has already been awarded");
  }

  if (input.decision === "COUNTER") {
    if (negotiation.status !== "OPEN") {
      throw AppError.conflict(`Cannot counter-offer on a negotiation in status ${negotiation.status}`);
    }

    const callerAuthorRole = side === "buyer" ? ("BUYER" as const) : ("SUPPLIER" as const);
    const lastAuthor = negotiation.events[0]?.authorRole;
    if (lastAuthor === callerAuthorRole) {
      throw AppError.conflict("It is not your turn to counter-offer — waiting on the other side to respond");
    }

    const validRfqItemIds = new Set(
      (await prisma.rfqItem.findMany({ where: { rfqId: negotiation.rfqId }, select: { id: true } })).map((i) => i.id)
    );
    assertItemsMapToRfq(validRfqItemIds, input.items!);

    await prisma.negotiationEvent.create({
      data: {
        negotiationId,
        authorRole: callerAuthorRole,
        actorUserId,
        message: input.message,
        items: { create: input.items! },
      },
    });

    await recordAudit({
      actorUserId,
      organizationId,
      action: "NEGOTIATION_COUNTER_OFFER_CREATED",
      targetType: "Negotiation",
      targetId: negotiationId,
      metadata: { authorRole: callerAuthorRole },
    });
  } else {
    const to: NegotiationStatus = input.decision === "ACCEPT" ? "ACCEPTED" : "CLOSED";
    if (!NEGOTIATION_STATUS_TRANSITIONS[negotiation.status].includes(to)) {
      throw AppError.conflict(`Cannot move a negotiation from ${negotiation.status} to ${to}`);
    }

    await prisma.negotiation.update({
      where: { id: negotiationId },
      data: { status: to, closedAt: new Date(), closeReason: input.message ?? null },
    });

    await recordAudit({
      actorUserId,
      organizationId,
      action: input.decision === "ACCEPT" ? "NEGOTIATION_ACCEPTED" : "NEGOTIATION_CLOSED",
      targetType: "Negotiation",
      targetId: negotiationId,
      metadata: { by: side },
    });
  }

  return getNegotiationForViewer(negotiationId, actorUserId);
}
