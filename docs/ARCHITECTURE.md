# Architecture

## Shape: modular monolith

Per `docs/handoff/ARCHITECTURE_PRINCIPLES.md`, MARKET HUB is a modular
monolith, not a microservice mesh. The backend is one Express application
with clearly separated domain modules under `apps/backend/src/modules/`:

- `auth/` — registration, login, logout, token refresh/rotation
- `users/` — the authenticated user's own profile and organization list
- `organizations/` — organizations, memberships, ownership
- `admin/` — the platform-admin boundary (verification, organization/user listing)
- `health/` — liveness/readiness

Cross-cutting concerns live outside the modules:

- `middleware/` — request ID, structured error handling, request validation, authentication, organization authorization
- `lib/` — Prisma client, logger, password hashing, JWT signing, refresh-token rotation, audit logging

This keeps each domain small and testable without introducing service
boundaries, queues or inter-service network calls this phase does not need
(Rule 17 — do not overengineer).

## Monorepo layout

npm workspaces tie three packages together:

- `packages/shared` — enums (`PlatformRole`, `BusinessType`, `MembershipRole`,
  `VerificationStatus`, ...) and Zod request schemas, so the frontend and
  backend can never drift on what a valid request/role looks like. The
  frontend imports its compiled `dist/` output like any other dependency;
  the backend does the same (its `tsconfig.json` intentionally does **not**
  path-map into `packages/shared/src` — see the note in that file — so
  `packages/shared` must be built before the backend or frontend build/
  typecheck run; `npm run build` and `npm run build:*` do this automatically).
- `apps/backend` — the API.
- `apps/frontend` — the web application.

## Data model

Users belong to the platform; they participate in organizations through
`OrganizationMembership` rows. Business identity (`businessType`) belongs to
`Organization`, never to a platform role — see `docs/AUTHORIZATION.md`.

## Money

No monetary fields exist yet in this phase. When they arrive (Phase H),
they must be stored as integer minor units (e.g. kobo for NGN), per
`docs/handoff/ARCHITECTURE_PRINCIPLES.md` — never floating point.

## Auditability

`AuditLog` is a deliberately minimal table for security/administrative
events (registration, login, logout, refresh-token reuse detection,
organization creation/update, membership changes, ownership transfer,
verification status changes). It is not a general-purpose event log —
extending it to cover new domains is a decision for the phase that
introduces them.

## API conventions

- All responses are JSON. Errors follow `{ error: { code, message, details? }, requestId }`.
- Every request carries an `x-request-id` (client-supplied or generated) echoed back on the response and included in server logs.
- Validation happens once, at the edge, via `zod` schemas from `@market-hub/shared` where the schema is also useful to the frontend, or backend-local schemas for backend-only shapes (e.g. pagination).
- Authentication (`requireAuth`) and authorization (`requirePlatformRole`, `requireOrganizationMembership`) are separate middleware — see `docs/AUTHORIZATION.md`.

## Frontend

Next.js App Router, TypeScript, Tailwind CSS using the token palette from
`docs/handoff/UI_UX_DESIGN_SYSTEM.md`. The frontend never receives data it
isn't authorized to see — every page fetches from the API using the
caller's own access token, and the API is the sole enforcement point for
what that token can see (Rule 6).

Session model: refresh tokens live in an httpOnly, `SameSite=Lax` cookie
scoped to `/api/auth`; access tokens live in memory only (React context),
never in `localStorage`. On load, the app silently calls `POST /auth/refresh`
to recover a session from the cookie if one exists.

## Known architectural trade-off: refresh-token rotation grace period

See `docs/AUTHENTICATION.md#rotation-and-the-grace-period` — this was a
real bug found and fixed during this phase via actual browser testing
(not just unit tests), and is flagged there in detail as a security-relevant
decision for review.
