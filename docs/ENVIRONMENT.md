# Environment configuration

All backend configuration is validated at startup with `zod`
(`apps/backend/src/config/env.ts`) — the process refuses to start rather
than run with missing or malformed configuration. See
`apps/backend/.env.example` for the full list with comments; summary below.

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | no (default `development`) | `development` \| `test` \| `production` |
| `PORT` | no (default `4000`) | |
| `DATABASE_URL` | **yes** | PostgreSQL connection string used by Prisma |
| `JWT_ACCESS_SECRET` | **yes** | ≥16 chars. Generate with `openssl rand -hex 32`. Never reuse across environments. Used to sign access tokens only — refresh tokens are opaque random values stored hashed in the database, not JWTs, so there is no separate refresh secret. |
| `JWT_ACCESS_TTL` | no (default `15m`) | Must match `\d+(ms\|s\|m\|h\|d\|w\|y)` |
| `JWT_REFRESH_TTL_DAYS` | no (default `30`) | |
| `CORS_ORIGINS` | no (default `http://localhost:3000`) | Comma-separated allow-list. Never a wildcard when `credentials: true` is in use. |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | no | Only read by `npm run prisma:seed` — see README "Bootstrapping a platform admin" |

The frontend reads one variable, `NEXT_PUBLIC_API_URL` (see
`apps/frontend/.env.local.example`), and nothing else — it holds no
secrets, since everything sensitive is enforced and stored server-side.

**Never commit `.env` or `.env.local` files.** Only `.env.example` and
`.env.local.example` are checked in.
