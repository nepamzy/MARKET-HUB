import type { NextFunction, Request, Response } from "express";
import type { MembershipRole } from "@market-hub/shared";
import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";

export interface OrganizationMembershipContext {
  organizationId: string;
  role: MembershipRole;
}

declare module "express-serve-static-core" {
  interface Request {
    membership?: OrganizationMembershipContext;
  }
}

const ROLE_RANK: Record<MembershipRole, number> = { STAFF: 0, MANAGER: 1, OWNER: 2 };

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
      select: { role: true },
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

    req.membership = { organizationId, role: membership.role };
    next();
  };
}
