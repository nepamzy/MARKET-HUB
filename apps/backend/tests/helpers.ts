import crypto from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { REFRESH_COOKIE_NAME } from "../src/lib/refreshTokens";

export function testApp(): Express {
  return createApp();
}

export interface RegisteredUser {
  accessToken: string;
  refreshCookie: string;
  userId: string;
  email: string;
}

let counter = 0;
export function uniqueEmail(prefix = "user"): string {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}@example.com`;
}

export async function registerAndLogin(app: Express, overrides: Partial<Record<string, string>> = {}) {
  const email = overrides.email ?? uniqueEmail();
  const password = overrides.password ?? "Str0ngPassw0rd!";
  const name = overrides.name ?? "Test User";

  const res = await request(app).post("/api/auth/register").send({ name, email, password });
  if (res.status !== 201) {
    throw new Error(`Registration failed in test helper: ${res.status} ${JSON.stringify(res.body)}`);
  }

  const setCookie = res.headers["set-cookie"];
  const refreshCookie = Array.isArray(setCookie) ? setCookie[0] : (setCookie as unknown as string);

  return {
    accessToken: res.body.accessToken as string,
    refreshCookie,
    userId: res.body.user.id as string,
    email,
  } satisfies RegisteredUser;
}

export async function promoteToPlatformAdmin(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { platformRole: "PLATFORM_ADMIN" } });
}

/** Extracts the raw refresh token value out of a `Set-Cookie` header string. */
export function extractRefreshToken(setCookieHeader: string): string {
  const match = setCookieHeader.match(new RegExp(`${REFRESH_COOKIE_NAME}=([^;]+)`));
  if (!match) {
    throw new Error(`Could not find ${REFRESH_COOKIE_NAME} in cookie header: ${setCookieHeader}`);
  }
  return decodeURIComponent(match[1]);
}

/**
 * Backdates a refresh token's `revokedAt` in the test database, so tests
 * can exercise "outside the rotation grace period" without a real sleep.
 */
export async function backdateTokenRevocation(rawToken: string, msAgo: number): Promise<void> {
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  await prisma.refreshToken.update({
    where: { tokenHash },
    data: { revokedAt: new Date(Date.now() - msAgo) },
  });
}
