# Database

PostgreSQL via Prisma. Schema: `apps/backend/prisma/schema.prisma`.
Migrations: `apps/backend/prisma/migrations/` (one so far: `init`).

## Tables (Phase A)

| Table | Purpose |
| --- | --- |
| `users` | Platform accounts. `platformRole` (`PLATFORM_ADMIN` \| `CUSTOMER` \| `DRIVER`), `accountStatus` (`ACTIVE` \| `SUSPENDED`), Argon2id `passwordHash`. |
| `refresh_tokens` | One row per issued refresh token (hashed, never stored in plaintext), with `family`, `revokedAt`, `replacedByTokenId` for rotation/reuse-detection — see `docs/AUTHENTICATION.md`. |
| `organizations` | The business entity. `businessType`, `status`, `verificationStatus`. |
| `organization_memberships` | Join table: which users belong to which organizations, and their `role` (`OWNER` \| `MANAGER` \| `STAFF`). Unique on `(organizationId, userId)`. |
| `audit_logs` | Minimal audit trail for security/admin actions — see `docs/ARCHITECTURE.md#auditability`. |

## Migration workflow

- **Development**: `npx prisma migrate dev --name <description>` (from `apps/backend/`) — creates and applies a new migration against your local dev database, and regenerates the Prisma client.
- **Production/CI**: `npx prisma migrate deploy` — applies pending migrations only, never generates new ones, never uses `db push`. This is the only command intended to touch a production database (Rule 18).
- The test database (`markethub_test` in local dev) is kept in sync the same way `migrate deploy` would in production, so tests run against real, migration-created schema rather than an ad hoc one.

## Seeding

`apps/backend/prisma/seed.ts` creates (or promotes) exactly one
`PLATFORM_ADMIN` user from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` /
`SEED_ADMIN_NAME`, and no-ops if those aren't set. Run with
`npm run prisma:seed` from `apps/backend/`. This is the only way to create
a platform admin — see `docs/AUTHORIZATION.md`.
