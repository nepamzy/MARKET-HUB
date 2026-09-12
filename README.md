# MARKET HUB

Commerce, supply chain and logistics infrastructure connecting producers,
wholesalers, retailers, direct businesses, customers and logistics
providers.

This repository is currently at **Phase A — Foundation**: identity,
authentication, organizations, platform/membership authorization, a
verification foundation, an admin boundary, and the responsive UI shell
that phase requires. No marketplace, catalogue, procurement, payments or
logistics functionality exists yet — see
[`docs/handoff/PHASE_ROADMAP.md`](docs/handoff/PHASE_ROADMAP.md) for what
comes next, and [`CLAUDE.md`](CLAUDE.md) for the permanent engineering
rules this project is built under.

## Structure

```
apps/
  backend/    Node.js + Express + TypeScript API, Prisma/PostgreSQL
  frontend/   Next.js (App Router) + TypeScript + Tailwind CSS
packages/
  shared/     Enums and Zod schemas shared between backend and frontend
docs/         Project documentation (this phase's docs + the master handoff)
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the reasoning behind
this layout.

## Prerequisites

- Node.js 20+
- PostgreSQL 14+ (a local instance is fine for development)

## Getting started

```bash
# 1. Install dependencies (installs all workspaces)
npm install

# 2. Configure the backend
cp apps/backend/.env.example apps/backend/.env
# edit apps/backend/.env — set DATABASE_URL and generate real JWT secrets:
#   openssl rand -hex 32

# 3. Configure the frontend
cp apps/frontend/.env.local.example apps/frontend/.env.local

# 4. Create the databases (adjust to your local Postgres setup)
createdb markethub_dev
createdb markethub_test   # used by the backend test suite

# 5. Build the shared package (both apps depend on its compiled output)
npm run build --workspace packages/shared

# 6. Apply migrations
cd apps/backend
npx prisma migrate deploy     # or `npx prisma migrate dev` while developing the schema
cd ../..

# 7. Run both apps in development
npm run dev:backend    # http://localhost:4000
npm run dev:frontend   # http://localhost:3000
```

### Bootstrapping a platform admin

There is no public API path that grants the `PLATFORM_ADMIN` platform role
(see [`docs/AUTHORIZATION.md`](docs/AUTHORIZATION.md)). To create one
locally:

```bash
cd apps/backend
SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD='ChangeMe123' npm run prisma:seed
```

## Testing, type checking, linting, building

```bash
npm run test:backend        # Vitest + Supertest, against markethub_test
npm run typecheck:backend
npm run typecheck:frontend
npm run lint:backend
npm run lint:frontend
npm run build                # builds shared, backend, then frontend
```

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — module layout and design principles
- [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) — configuration reference
- [`docs/DATABASE.md`](docs/DATABASE.md) — schema and migration workflow
- [`docs/AUTHENTICATION.md`](docs/AUTHENTICATION.md) — registration, login, tokens, rotation
- [`docs/AUTHORIZATION.md`](docs/AUTHORIZATION.md) — platform roles, membership roles, org isolation
- [`docs/ORGANIZATIONS.md`](docs/ORGANIZATIONS.md) — organization/membership model and business rules
- [`docs/handoff/`](docs/handoff/) — the product/architecture master handoff from ChatGPT (Master Product Architect)
