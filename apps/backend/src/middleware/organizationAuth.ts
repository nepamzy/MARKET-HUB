import type { NextFunction, Request, Response } from "express";
import type { MembershipRole, PermissionLevel, PermissionResource } from "@market-hub/shared";
import { PERMISSION_LEVEL_RANK } from "@market-hub/shared";
import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { resolvePermissionLevel } from "../lib/permissions";

export interface OrganizationMembershipContext {
  id: string;
  organizationId: string;
  role: MembershipRole;
}

declare module "express-serve-static-core" {
  interface Request {
    membership?: OrganizationMembershipContext;
  }
}

// Exported for services that need the same role ordering outside the
// :organizationId URL-param pattern this middleware assumes — e.g.
// orders.service.ts, where the relevant organization is derived from an
// order, not a route param.
export const ROLE_RANK: Record<MembershipRole, number> = { STAFF: 0, MANAGER: 1, OWNER: 2 };

/**
 * Loads the caller's membership for `:organizationId` from the database —
 * never from a client-supplied role/org header — and rejects the request if
 * no membership exists (Rule 7: cross-organization access must be denied)
 * or if the membership role is below `minRole`.
 *
 * PLATFORM_ADMIN is intentionally NOT granted a bypass here: platform
 * admins get their own dedicated admin endpoints (Step 13 / admin
 * boundary), so that "admin can do anything to any organization" is an
 * explicit, auditable decision rather than an implicit side effect of this
 * middleware.
 */
export function requireOrganizationMembership(minRole: MembershipRole = "STAFF") {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }

    const organizationId = req.params.organizationId;
    if (!organizationId) {
      next(AppError.badRequest("organizationId is required"));
      return;
    }

    const membership = await prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId: req.user.id } },
      select: { id: true, role: true },
    });

    if (!membership) {
      // Same response whether the org doesn't exist or the user isn't a
      // member of it — do not leak which organizations exist.
      next(AppError.forbidden("You do not have access to this organization"));
      return;
    }

    if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
      next(AppError.forbidden("Your role does not permit this action"));
      return;
    }

    req.membership = { id: membership.id, organizationId, role: membership.role };
    next();
  };
}

/**
 * Business-scoped permission check (Phase 0.1). Must run after
 * `requireOrganizationMembership` — it reads `req.membership`, it does not
 * look it up itself, so the two middlewares stay independently testable and
 * a route can require membership without requiring a specific permission.
 * Resolution logic lives in lib/permissions.ts (resolvePermissionLevel) so
 * the API layer can reuse the exact same computation to display current
 * permissions — see that file's docstring for the resolution order.
 */
export function requirePermission(resource: PermissionResource, minLevel: PermissionLevel = "VIEW") {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.membership) {
      // Programmer error, not a client error — this middleware is only
      // ever wired in after requireOrganizationMembership.
      next(AppError.internal("requirePermission used without requireOrganizationMembership"));
      return;
    }

    const level = await resolvePermissionLevel(req.membership, resource);
    if (PERMISSION_LEVEL_RANK[level] < PERMISSION_LEVEL_RANK[minLevel]) {
      next(AppError.forbidden(`You do not have ${minLevel.toLowerCase()} access to ${resource.toLowerCase()}`));
      return;
    }

    next();
  };
}
