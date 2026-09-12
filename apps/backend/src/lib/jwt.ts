import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import type { PlatformRole } from "@market-hub/shared";

export interface AccessTokenPayload {
  sub: string;
  platformRole: PlatformRole;
}

// @types/jsonwebtoken types `expiresIn` as a narrow template-literal union
// (e.g. "15m", "1d") rather than `string`, so a value validated at runtime
// by env.ts (see the JWT_ACCESS_TTL regex) still needs an explicit cast here.
const accessTokenTtl = env.JWT_ACCESS_TTL as SignOptions["expiresIn"];

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: accessTokenTtl,
    issuer: "market-hub",
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: "market-hub" });
  if (typeof decoded === "string") {
    throw new Error("Invalid token payload");
  }
  return decoded as unknown as AccessTokenPayload;
}
