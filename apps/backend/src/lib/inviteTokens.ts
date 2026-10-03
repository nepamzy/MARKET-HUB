import { createHash, randomBytes } from "node:crypto";

/**
 * Same discipline as refreshTokens.ts: a high-entropy opaque token is
 * generated once, handed to the caller, and only its SHA-256 hash is ever
 * persisted or logged. The raw token is never recoverable from the
 * database — losing it means the link has to be revoked and a new one
 * issued, exactly like a refresh token.
 */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
