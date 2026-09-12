import { afterAll, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma";

/**
 * Truncates every application table before each test so tests are
 * independent and order-agnostic. Runs against `markethub_test` only —
 * never point TEST_DATABASE_URL at a real database.
 */
async function resetDatabase(): Promise<void> {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.organizationMembership.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});
