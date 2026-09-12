import crypto from "node:crypto";
import { env } from "../config/env";
import { prisma } from "./prisma";

export const REFRESH_COOKIE_NAME = "mh_refresh";
export const REFRESH_COOKIE_PATH = "/api/auth";

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

/**
 * Window during which presenting a token that was ALREADY rotated (it has
 * a `replacedByTokenId`) is treated as a benign race — two nearly
 * simultaneous refresh calls sharing one token (two browser tabs, a
 * client retry, React effects double-firing) — rather than theft. The
 * request is transparently fast-forwarded to the current end of the
 * rotation chain and issued a fresh token instead of the whole session
 * being torn down. A token revoked any other way (logout, a genuine
 * reuse-after-grace, explicit family revocation) has no
 * `replacedByTokenId` down that path and still fails hard.
 */
const ROTATION_GRACE_PERIOD_MS = 10_000;
const MAX_CHAIN_HOPS = 5;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateOpaqueToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

function refreshExpiry(): Date {
  const days = env.JWT_REFRESH_TTL_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/**
 * Issues a brand-new refresh token in a brand-new rotation family. Used at
 * registration and login.
 */
export async function issueRefreshToken(
  userId: string,
  meta: { ip?: string; userAgent?: string }
): Promise<IssuedRefreshToken> {
  const token = generateOpaqueToken();
  const family = crypto.randomUUID();
  const expiresAt = refreshExpiry();

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      family,
      expiresAt,
      createdByIp: meta.ip,
      userAgent: meta.userAgent,
    },
  });

  return { token, expiresAt };
}

export type RotateResult =
  | { status: "rotated"; token: string; expiresAt: Date; userId: string }
  | { status: "invalid" }
  | { status: "reused"; userId: string };

type TokenRow = {
  id: string;
  family: string;
  userId: string;
  revokedAt: Date | null;
  replacedByTokenId: string | null;
  expiresAt: Date;
};

async function revokeFamily(family: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { family, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Atomically claims `row` for rotation: the `revokedAt: null` predicate is
 * rechecked by Postgres against the committed row state at execution time,
 * so when two requests race for the same row, exactly one `updateMany`
 * reports `count: 1` and the other reports `count: 0` — there is no window
 * where both succeed and silently fork the family into two children.
 */
async function claimForRotation(row: TokenRow): Promise<{ newId: string } | null> {
  const newId = crypto.randomUUID();
  const result = await prisma.refreshToken.updateMany({
    where: { id: row.id, revokedAt: null },
    data: { revokedAt: new Date(), replacedByTokenId: newId },
  });
  return result.count === 1 ? { newId } : null;
}

async function rotateOnce(
  row: TokenRow,
  newId: string,
  meta: { ip?: string; userAgent?: string }
): Promise<{ token: string; expiresAt: Date }> {
  const newToken = generateOpaqueToken();
  const expiresAt = refreshExpiry();

  await prisma.refreshToken.create({
    data: {
      id: newId,
      userId: row.userId,
      tokenHash: hashToken(newToken),
      family: row.family,
      expiresAt,
      createdByIp: meta.ip,
      userAgent: meta.userAgent,
    },
  });

  return { token: newToken, expiresAt };
}

/**
 * A caller lost the atomic claim on `row`, or presented a token that was
 * already rotated by an earlier request. If that happened within the
 * grace period, walk forward to whatever `row` was most recently replaced
 * by and rotate from there instead of declaring theft — see
 * ROTATION_GRACE_PERIOD_MS. Returns null if the chain is stale (outside
 * the grace period), dead-ended, or unreasonably long.
 */
async function tryGraceCascade(
  row: TokenRow,
  meta: { ip?: string; userAgent?: string },
  hops = 0
): Promise<{ token: string; expiresAt: Date; userId: string } | null> {
  if (hops >= MAX_CHAIN_HOPS) return null;

  // The row may not have its revokedAt/replacedByTokenId set on our
  // in-memory copy yet if we lost the race a moment ago — re-read it.
  const fresh = await prisma.refreshToken.findUnique({ where: { id: row.id } });
  if (!fresh || !fresh.revokedAt || !fresh.replacedByTokenId) return null;
  if (Date.now() - fresh.revokedAt.getTime() > ROTATION_GRACE_PERIOD_MS) return null;

  const successor = await prisma.refreshToken.findUnique({ where: { id: fresh.replacedByTokenId } });
  if (!successor) return null;
  if (successor.expiresAt < new Date()) return null;

  if (successor.revokedAt) {
    // The successor was itself already rotated by yet another concurrent
    // request — keep walking the chain.
    return tryGraceCascade(successor, meta, hops + 1);
  }

  const claim = await claimForRotation(successor);
  if (!claim) {
    // Lost this hop's race too — walk forward again.
    return tryGraceCascade(successor, meta, hops + 1);
  }
  const result = await rotateOnce(successor, claim.newId, meta);
  return { ...result, userId: successor.userId };
}

/**
 * Rotates a refresh token. If a token that was already revoked is
 * presented, that is usually a signal of possible theft — the entire
 * family is revoked so a stolen token cannot be replayed indefinitely and
 * the legitimate user is forced to log in again — UNLESS it falls within
 * the short rotation grace period (see ROTATION_GRACE_PERIOD_MS), in which
 * case it is treated as a benign concurrent-request race instead.
 */
export async function rotateRefreshToken(
  presentedToken: string,
  meta: { ip?: string; userAgent?: string }
): Promise<RotateResult> {
  const tokenHash = hashToken(presentedToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing) {
    return { status: "invalid" };
  }

  if (existing.expiresAt < new Date()) {
    // Naturally expired (the refresh token's own TTL lapsed) — not a
    // theft signal, just stale. No need to tear down the rest of the
    // family over it.
    return { status: "invalid" };
  }

  if (existing.revokedAt) {
    const cascaded = await tryGraceCascade(existing, meta);
    if (cascaded) {
      return { status: "rotated", ...cascaded };
    }
    await revokeFamily(existing.family);
    return { status: "reused", userId: existing.userId };
  }

  const claim = await claimForRotation(existing);
  if (!claim) {
    // Someone else rotated this exact row a moment ago — fast-forward.
    const cascaded = await tryGraceCascade(existing, meta);
    if (cascaded) {
      return { status: "rotated", ...cascaded };
    }
    await revokeFamily(existing.family);
    return { status: "reused", userId: existing.userId };
  }

  const rotated = await rotateOnce(existing, claim.newId, meta);
  return { status: "rotated", ...rotated, userId: existing.userId };
}

export async function revokeRefreshToken(presentedToken: string): Promise<void> {
  const tokenHash = hashToken(presentedToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
