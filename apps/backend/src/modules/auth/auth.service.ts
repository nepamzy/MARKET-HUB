import type { LoginInput, RegisterInput } from "@market-hub/shared";
import { recordAudit } from "../../lib/audit";
import { AppError } from "../../lib/errors";
import { signAccessToken } from "../../lib/jwt";
import { hashPassword, verifyPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import {
  issueRefreshToken,
  revokeAllRefreshTokensForUser,
  revokeRefreshToken,
  rotateRefreshToken,
} from "../../lib/refreshTokens";

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  platformRole: true,
  accountStatus: true,
  createdAt: true,
} as const;

export async function registerUser(input: RegisterInput, meta: RequestMeta) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    // Do not reveal whether the email is taken via a different status code
    // than other validation failures — but registration UX conventionally
    // does tell the user their email is already in use, unlike login.
    throw AppError.conflict("An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone || null,
      passwordHash,
    },
    select: PUBLIC_USER_SELECT,
  });

  const refresh = await issueRefreshToken(user.id, meta);
  const accessToken = signAccessToken({ sub: user.id, platformRole: user.platformRole });

  await recordAudit({ actorUserId: user.id, action: "USER_REGISTERED", targetType: "User", targetId: user.id });

  return { user, accessToken, refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt };
}

const GENERIC_LOGIN_ERROR = "Invalid email or password";

export async function loginUser(input: LoginInput, meta: RequestMeta) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Always run a hash comparison, even for a nonexistent user, against a
  // fixed dummy hash — this keeps response timing similar whether or not
  // the account exists, and the error message never reveals which.
  const dummyHash = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$c29tZWhhc2h2YWx1ZQ";
  const passwordOk = await verifyPassword(user?.passwordHash ?? dummyHash, input.password);

  if (!user || !passwordOk) {
    throw AppError.unauthorized(GENERIC_LOGIN_ERROR);
  }

  if (user.accountStatus !== "ACTIVE") {
    // Deliberately generic too — do not tell an attacker probing emails
    // that this particular account exists but is suspended.
    throw AppError.unauthorized(GENERIC_LOGIN_ERROR);
  }

  const refresh = await issueRefreshToken(user.id, meta);
  const accessToken = signAccessToken({ sub: user.id, platformRole: user.platformRole });

  await recordAudit({ actorUserId: user.id, action: "USER_LOGIN", targetType: "User", targetId: user.id });

  const { passwordHash: _omit, ...publicUser } = user;
  return { user: publicUser, accessToken, refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt };
}

export async function refreshSession(presentedToken: string, meta: RequestMeta) {
  const result = await rotateRefreshToken(presentedToken, meta);

  if (result.status === "invalid") {
    throw AppError.unauthorized("Invalid refresh token");
  }

  if (result.status === "reused") {
    await recordAudit({
      actorUserId: result.userId,
      action: "REFRESH_TOKEN_REUSE_DETECTED",
      targetType: "User",
      targetId: result.userId,
    });
    throw AppError.unauthorized("Session invalidated — please log in again");
  }

  const user = await prisma.user.findUnique({
    where: { id: result.userId },
    select: PUBLIC_USER_SELECT,
  });

  if (!user || user.accountStatus !== "ACTIVE") {
    throw AppError.unauthorized("Account is not active");
  }

  const accessToken = signAccessToken({ sub: user.id, platformRole: user.platformRole });

  return {
    user,
    accessToken,
    refreshToken: result.token,
    refreshExpiresAt: result.expiresAt,
  };
}

export async function logoutUser(presentedToken: string, userId?: string): Promise<void> {
  await revokeRefreshToken(presentedToken);
  if (userId) {
    await recordAudit({ actorUserId: userId, action: "USER_LOGOUT", targetType: "User", targetId: userId });
  }
}

export async function logoutAllSessions(userId: string): Promise<void> {
  await revokeAllRefreshTokensForUser(userId);
  await recordAudit({ actorUserId: userId, action: "USER_LOGOUT_ALL", targetType: "User", targetId: userId });
}
