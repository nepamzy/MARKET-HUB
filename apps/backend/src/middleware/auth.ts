import type { NextFunction, Request, Response } from "express";
import type { PlatformRole } from "@market-hub/shared";
import { AppError } from "../lib/errors";
import { verifyAccessToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";

export interface AuthenticatedUser {
  id: string;
  platformRole: PlatformRole;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthenticatedUser;
  }
}

/**
 * Verifies the access token AND re-checks the user's current account status
 * in the database. A JWT alone can't reflect a suspension that happened
 * after the token was issued, so we treat the token as proof of identity
 * only, never as a stale snapshot of authorization state (Rule 6).
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    next(AppError.unauthorized());
    return;
  }

  const token = header.slice("Bearer ".length).trim();

  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, platformRole: true, accountStatus: true },
    });

    if (!user || user.accountStatus !== "ACTIVE") {
      next(AppError.unauthorized("Account is not active"));
      return;
    }

    req.user = { id: user.id, platformRole: user.platformRole };
    next();
  } catch {
    next(AppError.unauthorized("Invalid or expired access token"));
  }
}

export function requirePlatformRole(...roles: PlatformRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (!roles.includes(req.user.platformRole)) {
      next(AppError.forbidden());
      return;
    }
    next();
  };
}
