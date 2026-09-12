/**
 * Optional bootstrap script: creates a single PLATFORM_ADMIN user from
 * environment variables. There is no public API path that grants
 * PLATFORM_ADMIN — it is only ever set here or by direct database action,
 * keeping platform administration separate from organization ownership.
 *
 * Run with: npm run prisma:seed --workspace apps/backend
 * Requires SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to be set; no-ops
 * otherwise.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() || "Platform Admin";

  if (!email || !password) {
    console.log("SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin seed.");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.platformRole !== "PLATFORM_ADMIN") {
      await prisma.user.update({ where: { email }, data: { platformRole: "PLATFORM_ADMIN" } });
      console.log(`Promoted existing user ${email} to PLATFORM_ADMIN.`);
    } else {
      console.log(`${email} is already a PLATFORM_ADMIN — nothing to do.`);
    }
    return;
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await prisma.user.create({
    data: { name, email, passwordHash, platformRole: "PLATFORM_ADMIN" },
  });
  console.log(`Created PLATFORM_ADMIN user ${email}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
