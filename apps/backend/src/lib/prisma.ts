import { PrismaClient } from "@prisma/client";
import { isProduction } from "../config/env";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Reuse a single client across hot reloads in dev to avoid exhausting the
// Postgres connection pool.
export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: isProduction ? ["error", "warn"] : ["error", "warn"],
  });

if (!isProduction) {
  global.__prisma = prisma;
}
