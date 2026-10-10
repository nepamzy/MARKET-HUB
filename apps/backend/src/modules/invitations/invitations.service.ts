import type { CreateInviteLinkInput, MembershipRole } from "@market-hub/shared";
import { recordAudit } from "../../lib/audit";
import { AppError } from "../../lib/errors";
import { generateInviteToken, hashInviteToken } from "../../lib/inviteTokens";
import { prisma } from "../../lib/prisma";
import { notify } from "../notifications/notifications.service";

const MAX_INVITE_LINKS_PER_LIST = 100;

export async function createInviteLink(
  organizationId: string,
  actorUserId: string,
  input: CreateInviteLinkInput & { inviteeEmail?: string; role?: MembershipRole }
) {
  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);

  const link = await prisma.organizationInviteLink.create({
    data: {
      organizationId,
      tokenHash,
      inviteeEmail: input.inviteeEmail?.toLowerCase(),
      role: input.role ?? "STAFF",
      createdByUserId: actorUserId,
      expiresAt,
      maxUses: input.maxUses,
    },
    select: { id: true, inviteeEmail: true, role: true, expiresAt: true, maxUses: true, createdAt: true },
  });

  await recordAudit({
    actorUserId,
    organizationId,
    action: input.inviteeEmail ? "INVITATION_CREATED" : "INVITE_LINK_CREATED",
    targetType: "OrganizationInviteLink",
    targetId: link.id,
    metadata: { inviteeEmail: input.inviteeEmail, role: link.role, expiresAt: link.expiresAt },
  });

  // Only notifiable if the invitee already has an account — a generic
  // link, or a direct invite to an email with no matching account yet,
  // has no in-app recipient to notify (they'll see it when they sign up
  // and open the link itself).
  if (input.inviteeEmail) {
    const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { legalName: true } });
    const invitee = await prisma.user.findUnique({ where: { email: input.inviteeEmail.toLowerCase() }, select: { id: true } });
    if (invitee && organization) {
      await notify({
        recipientUserId: invitee.id,
        type: "INVITATION_RECEIVED",
        title: "You've been invited to join a business",
        message: `${organization.legalName} invited you to join as ${link.role}.`,
        relatedEntityType: "OrganizationInviteLink",
        relatedEntityId: link.id,
        dedupeKey: `INVITATION_RECEIVED:${link.id}`,
      });
    }
  }

  // The raw token is returned exactly once, here, and never persisted or
  // logged anywhere else — same discipline as a refresh token.
  return { ...link, token };
}

export async function listInviteLinks(organizationId: string) {
  return prisma.organizationInviteLink.findMany({
    where: { organizationId },
    select: {
      id: true,
      inviteeEmail: true,
      role: true,
      expiresAt: true,
      maxUses: true,
      useCount: true,
      revokedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: MAX_INVITE_LINKS_PER_LIST,
  });
}

export async function revokeInviteLink(organizationId: string, linkId: string, actorUserId: string) {
  const link = await prisma.organizationInviteLink.findFirst({
    where: { id: linkId, organizationId },
    select: { id: true, revokedAt: true },
  });
  if (!link) {
    throw AppError.notFound("Invite link not found");
  }
  if (link.revokedAt) {
    return; // already revoked — idempotent, not an error
  }

  await prisma.organizationInviteLink.update({
    where: { id: linkId },
    data: { revokedAt: new Date() },
  });

  await recordAudit({
    actorUserId,
    organizationId,
    action: "INVITE_LINK_REVOKED",
    targetType: "OrganizationInviteLink",
    targetId: linkId,
  });
}

/**
 * PUBLIC resolution — deliberately returns almost nothing. This is the
 * function that makes "possessing the link doesn't grant access" real: it
 * confirms a token is currently valid and names the organization, and
 * nothing else. Expired/revoked/not-found/exhausted are all indistinguishable
 * to the caller (generic "invalid or expired" outcome) — same
 * anti-enumeration discipline as login error responses.
 */
export async function resolveInviteToken(token: string) {
  const tokenHash = hashInviteToken(token);
  const link = await prisma.organizationInviteLink.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      maxUses: true,
      useCount: true,
      organization: { select: { id: true, legalName: true } },
    },
  });

  if (!link || isInviteLinkInvalid(link)) {
    throw AppError.notFound("This invite link is invalid or has expired");
  }

  return { organizationId: link.organization.id, organizationName: link.organization.legalName };
}

function isInviteLinkInvalid(link: {
  expiresAt: Date;
  revokedAt: Date | null;
  maxUses: number | null;
  useCount: number;
}): boolean {
  if (link.revokedAt) return true;
  if (link.expiresAt.getTime() < Date.now()) return true;
  if (link.maxUses !== null && link.useCount >= link.maxUses) return true;
  return false;
}

/**
 * Authenticated acceptance/request step. Re-validates the token server-side
 * from scratch — the frontend having shown a valid-looking invite screen is
 * never treated as proof the link is still good, since it could have been
 * revoked or exhausted in between.
 *
 * Two outcomes depending on how the link was created:
 *  - Direct invitation (inviteeEmail set): only the matching authenticated
 *    account may accept, and acceptance creates the membership immediately
 *    — the approval already happened when the admin targeted this person.
 *  - Generic link (inviteeEmail null): creates a PENDING join request that
 *    still requires explicit OWNER/MANAGER review before any membership
 *    exists. This is the enforcement point for the stated security
 *    requirement that possessing a link never grants access by itself.
 */
export async function acceptOrRequestInvite(token: string, actorUserId: string) {
  const tokenHash = hashInviteToken(token);

  return prisma.$transaction(async (tx) => {
    const link = await tx.organizationInviteLink.findUnique({ where: { tokenHash } });
    if (!link || isInviteLinkInvalid(link)) {
      throw AppError.notFound("This invite link is invalid or has expired");
    }

    const existingMembership = await tx.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: link.organizationId, userId: actorUserId } },
    });
    if (existingMembership) {
      throw AppError.conflict("You are already a member of this business");
    }

    if (link.inviteeEmail) {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: actorUserId },
        select: { email: true },
      });
      if (user.email.toLowerCase() !== link.inviteeEmail) {
        throw AppError.forbidden("This invitation was sent to a different email address");
      }

      const existingRequest = await tx.organizationJoinRequest.findFirst({
        where: { inviteLinkId: link.id, userId: actorUserId },
      });
      if (existingRequest) {
        throw AppError.conflict("This invitation has already been used");
      }

      const [request] = await Promise.all([
        tx.organizationJoinRequest.create({
          data: {
            organizationId: link.organizationId,
            userId: actorUserId,
            inviteLinkId: link.id,
            status: "APPROVED",
            reviewedByUserId: link.createdByUserId,
            reviewedAt: new Date(),
          },
        }),
        tx.organizationMembership.create({
          data: { organizationId: link.organizationId, userId: actorUserId, role: link.role },
        }),
        tx.organizationInviteLink.update({
          where: { id: link.id },
          data: { useCount: { increment: 1 } },
        }),
      ]);

      await recordAudit({
        actorUserId,
        organizationId: link.organizationId,
        action: "INVITATION_ACCEPTED",
        targetType: "OrganizationJoinRequest",
        targetId: request.id,
        metadata: { role: link.role },
      });

      return { status: "APPROVED" as const, organizationId: link.organizationId };
    }

    const existingPending = await tx.organizationJoinRequest.findFirst({
      where: { organizationId: link.organizationId, userId: actorUserId, status: "PENDING" },
    });
    if (existingPending) {
      throw AppError.conflict("You already have a pending request to join this business");
    }

    const request = await tx.organizationJoinRequest.create({
      data: { organizationId: link.organizationId, userId: actorUserId, inviteLinkId: link.id, status: "PENDING" },
    });
    await tx.organizationInviteLink.update({
      where: { id: link.id },
      data: { useCount: { increment: 1 } },
    });

    await recordAudit({
      actorUserId,
      organizationId: link.organizationId,
      action: "JOIN_REQUEST_CREATED",
      targetType: "OrganizationJoinRequest",
      targetId: request.id,
    });

    return { status: "PENDING" as const, organizationId: link.organizationId };
  });
}

export async function listJoinRequests(organizationId: string, status?: "PENDING" | "APPROVED" | "REJECTED") {
  return prisma.organizationJoinRequest.findMany({
    where: { organizationId, ...(status ? { status } : {}) },
    select: {
      id: true,
      status: true,
      createdAt: true,
      reviewedAt: true,
      user: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Approve/reject a PENDING join request created via a generic link. Direct
 * invitations never reach this function — they're approved at acceptance
 * time (see acceptOrRequestInvite) and never sit in PENDING.
 */
export async function reviewJoinRequest(
  organizationId: string,
  requestId: string,
  actorUserId: string,
  decision: "APPROVED" | "REJECTED"
) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.organizationJoinRequest.findFirst({
      where: { id: requestId, organizationId },
    });
    if (!request) {
      throw AppError.notFound("Join request not found");
    }
    if (request.status !== "PENDING") {
      throw AppError.conflict("This request has already been reviewed");
    }

    if (decision === "APPROVED") {
      const existingMembership = await tx.organizationMembership.findUnique({
        where: { organizationId_userId: { organizationId, userId: request.userId } },
      });
      if (existingMembership) {
        throw AppError.conflict("This user is already a member");
      }
      // Fixed default role for requests originating from a generic link —
      // never client-supplied, and deliberately the least-privileged role.
      // An owner can promote via the existing updateMemberRole endpoint
      // afterward if warranted.
      await tx.organizationMembership.create({
        data: { organizationId, userId: request.userId, role: "STAFF" },
      });
    }

    const updated = await tx.organizationJoinRequest.update({
      where: { id: requestId },
      data: { status: decision, reviewedByUserId: actorUserId, reviewedAt: new Date() },
      select: { id: true, status: true, userId: true },
    });

    await recordAudit({
      actorUserId,
      organizationId,
      action: decision === "APPROVED" ? "JOIN_REQUEST_APPROVED" : "JOIN_REQUEST_REJECTED",
      targetType: "OrganizationJoinRequest",
      targetId: requestId,
      metadata: { targetUserId: updated.userId },
    });

    const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { legalName: true } });
    await notify({
      recipientUserId: updated.userId,
      type: "JOIN_REQUEST_DECIDED",
      title: decision === "APPROVED" ? "Your request to join was approved" : "Your request to join was rejected",
      message: `${organization?.legalName ?? "A business"} ${decision === "APPROVED" ? "approved" : "rejected"} your request to join.`,
      relatedEntityType: "OrganizationJoinRequest",
      relatedEntityId: requestId,
      dedupeKey: `JOIN_REQUEST_DECIDED:${requestId}`,
    });

    return updated;
  });
}
