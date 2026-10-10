import type { CreateOrganizationInput, MembershipRole, PermissionLevel, PermissionResource } from "@market-hub/shared";
import { PERMISSION_RESOURCES } from "@market-hub/shared";
import { recordAudit } from "../../lib/audit";
import { AppError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { resolvePermissionLevel } from "../../lib/permissions";

export const ORGANIZATION_SELECT = {
  id: true,
  legalName: true,
  businessType: true,
  status: true,
  verificationStatus: true,
  createdAt: true,
  updatedAt: true,
} as const;

const MEMBER_SELECT = {
  id: true,
  role: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
} as const;

export async function createOrganization(ownerUserId: string, input: CreateOrganizationInput) {
  const organization = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: { legalName: input.legalName, businessType: input.businessType },
      select: ORGANIZATION_SELECT,
    });
    await tx.organizationMembership.create({
      data: { organizationId: org.id, userId: ownerUserId, role: "OWNER" },
    });
    return org;
  });

  await recordAudit({
    actorUserId: ownerUserId,
    organizationId: organization.id,
    action: "ORGANIZATION_CREATED",
    targetType: "Organization",
    targetId: organization.id,
  });

  return organization;
}

export async function getOrganization(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: ORGANIZATION_SELECT,
  });
  if (!organization) {
    throw AppError.notFound("Organization not found");
  }
  return organization;
}

export async function updateOrganizationName(organizationId: string, legalName: string, actorUserId: string) {
  const organization = await prisma.organization.update({
    where: { id: organizationId },
    data: { legalName },
    select: ORGANIZATION_SELECT,
  });
  await recordAudit({
    actorUserId,
    organizationId,
    action: "ORGANIZATION_UPDATED",
    targetType: "Organization",
    targetId: organizationId,
    metadata: { legalName },
  });
  return organization;
}

export async function listMembers(organizationId: string) {
  return prisma.organizationMembership.findMany({
    where: { organizationId },
    select: MEMBER_SELECT,
    orderBy: { createdAt: "asc" },
  });
}

export async function addMember(organizationId: string, email: string, role: MembershipRole, actorUserId: string) {
  const targetUser = await prisma.user.findUnique({ where: { email } });
  if (!targetUser) {
    throw AppError.notFound("No MARKET HUB account exists for that email");
  }

  const existing = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId: targetUser.id } },
  });
  if (existing) {
    throw AppError.conflict("This user is already a member of the organization");
  }

  const membership = await prisma.organizationMembership.create({
    data: { organizationId, userId: targetUser.id, role },
    select: MEMBER_SELECT,
  });

  await recordAudit({
    actorUserId,
    organizationId,
    action: "MEMBER_ADDED",
    targetType: "User",
    targetId: targetUser.id,
    metadata: { role },
  });

  return membership;
}

async function countOwners(organizationId: string): Promise<number> {
  return prisma.organizationMembership.count({ where: { organizationId, role: "OWNER" } });
}

export async function updateMemberRole(
  organizationId: string,
  targetUserId: string,
  newRole: Exclude<MembershipRole, "OWNER">,
  actorUserId: string
) {
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId: targetUserId } },
  });
  if (!membership) {
    throw AppError.notFound("Membership not found");
  }

  if (membership.role === "OWNER" && (await countOwners(organizationId)) <= 1) {
    throw AppError.conflict(
      "Cannot change the role of the last remaining owner — transfer ownership first"
    );
  }

  const updated = await prisma.organizationMembership.update({
    where: { organizationId_userId: { organizationId, userId: targetUserId } },
    data: { role: newRole },
    select: MEMBER_SELECT,
  });

  await recordAudit({
    actorUserId,
    organizationId,
    action: "MEMBER_ROLE_UPDATED",
    targetType: "User",
    targetId: targetUserId,
    metadata: { previousRole: membership.role, newRole },
  });

  return updated;
}

export async function removeMember(organizationId: string, targetUserId: string, actorUserId: string) {
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId: targetUserId } },
  });
  if (!membership) {
    throw AppError.notFound("Membership not found");
  }

  if (membership.role === "OWNER" && (await countOwners(organizationId)) <= 1) {
    throw AppError.conflict(
      "Cannot remove the last remaining owner — transfer ownership first"
    );
  }

  await prisma.organizationMembership.delete({
    where: { organizationId_userId: { organizationId, userId: targetUserId } },
  });

  await recordAudit({
    actorUserId,
    organizationId,
    action: "MEMBER_REMOVED",
    targetType: "User",
    targetId: targetUserId,
    metadata: { removedRole: membership.role },
  });
}

/**
 * Explicit ownership transfer: the only path by which OWNER can be granted.
 * The acting owner is demoted to MANAGER so the organization never silently
 * accumulates owners through this endpoint (Rule: protect organization
 * ownership / no accidental loss of the last owner).
 */
export async function transferOwnership(organizationId: string, actorUserId: string, newOwnerUserId: string) {
  if (actorUserId === newOwnerUserId) {
    throw AppError.badRequest("You are already the owner");
  }

  const targetMembership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId: newOwnerUserId } },
  });
  if (!targetMembership) {
    throw AppError.badRequest("The new owner must already be a member of the organization");
  }

  await prisma.$transaction([
    prisma.organizationMembership.update({
      where: { organizationId_userId: { organizationId, userId: newOwnerUserId } },
      data: { role: "OWNER" },
    }),
    prisma.organizationMembership.update({
      where: { organizationId_userId: { organizationId, userId: actorUserId } },
      data: { role: "MANAGER" },
    }),
  ]);

  await recordAudit({
    actorUserId,
    organizationId,
    action: "OWNERSHIP_TRANSFERRED",
    targetType: "User",
    targetId: newOwnerUserId,
  });
}

/**
 * Returns the resolved permission level for every resource for a given
 * member — i.e. what's actually in effect right now (override or role
 * default), not just the raw override rows. This is what the owner's
 * permission-editor UI reads to render current state.
 */
export async function getMemberPermissions(organizationId: string, targetUserId: string) {
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId: targetUserId } },
    select: { id: true, role: true },
  });
  if (!membership) {
    throw AppError.notFound("Membership not found");
  }

  const entries = await Promise.all(
    PERMISSION_RESOURCES.map(async (resource) => [resource, await resolvePermissionLevel(membership, resource)] as const)
  );

  return {
    role: membership.role,
    permissions: Object.fromEntries(entries) as Record<PermissionResource, PermissionLevel>,
  };
}

/**
 * Applies a partial set of permission overrides for one member. Two
 * deliberate guardrails beyond "does the caller have MANAGER+ role",
 * enforced by the route's requireOrganizationMembership("OWNER") already
 * covering who may call this at all:
 *  - OWNER-role members can't have their permissions edited — ownership is
 *    never a partial access level (same principle as updateMemberRole).
 *  - A member can't edit their own permissions — closes the trivial
 *    self-escalation path even for an OWNER acting on themselves, since an
 *    OWNER calling this on their own userId would otherwise be a confusing
 *    no-op at best.
 */
export async function updateMemberPermissions(
  organizationId: string,
  targetUserId: string,
  actorUserId: string,
  updates: Partial<Record<PermissionResource, PermissionLevel>>
) {
  if (actorUserId === targetUserId) {
    throw AppError.badRequest("You cannot modify your own permissions");
  }

  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId: targetUserId } },
    select: { id: true, role: true },
  });
  if (!membership) {
    throw AppError.notFound("Membership not found");
  }
  if (membership.role === "OWNER") {
    throw AppError.badRequest("Owner permissions cannot be modified");
  }

  const changes = Object.entries(updates) as [PermissionResource, PermissionLevel][];

  await prisma.$transaction(
    changes.map(([resource, level]) =>
      prisma.membershipPermission.upsert({
        where: { membershipId_resource: { membershipId: membership.id, resource } },
        create: { membershipId: membership.id, resource, level, grantedByUserId: actorUserId },
        update: { level, grantedByUserId: actorUserId },
      })
    )
  );

  await recordAudit({
    actorUserId,
    organizationId,
    action: "MEMBER_PERMISSIONS_UPDATED",
    targetType: "User",
    targetId: targetUserId,
    metadata: { changes: updates },
  });

  return getMemberPermissions(organizationId, targetUserId);
}
