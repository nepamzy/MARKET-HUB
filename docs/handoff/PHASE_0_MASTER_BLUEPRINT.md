# MARKET HUB — PHASE 0
## Master Platform Architecture, Gap Audit & Implementation Blueprint

**Status of this document:** planning only. No code was changed to produce this. Everything tagged `EXISTS` was verified by reading the actual file cited. Everything tagged `PROPOSED` is new and not yet built.

**Important correction, stated up front per the "don't pretend something exists" rule:** the brief for this phase states "Lovable has already been used to produce frontend workstreams and visual references" and instructs preserving that existing Lovable UI. I checked: this repository (`github.com/nepamzy/MARKET-HUB`) has exactly three commits, all on two branches I already know about (`claude/market-hub-repo-overview-v10w1z` and my own unpushed `claude/phase-a-hardening`), and no Lovable-authored code, routes, or components anywhere in `apps/frontend`. The only frontend that exists is the one built in Phase A (`docs/UI_UX_DESIGN_SYSTEM.md`'s implementation — login, register, dashboard, organizations, admin, account). If Lovable output exists, it is **not in this repository** — it's either in a separate Lovable project not yet merged here, or it hasn't been produced yet. I have treated the brand tokens given in this brief as authoritative (they exactly match what's already implemented in `apps/frontend/src/app/globals.css` and `tailwind.config.ts` — verified, not assumed), but I have not invented Lovable screens or components that I can't point to.

---

## 1. CURRENT ARCHITECTURE

```
market-hub/                              (npm workspaces monorepo)
├── apps/backend/          Express 4 + TypeScript, Prisma ORM, PostgreSQL
│   ├── prisma/schema.prisma              5 models, 6 enums, 1 migration
│   ├── src/config/env.ts                 Zod-validated startup config
│   ├── src/lib/           prisma, jwt, password, refreshTokens, audit, errors, logger
│   ├── src/middleware/     auth, organizationAuth, errorHandler, validate, requestId
│   ├── src/modules/        auth, users, organizations, admin, health
│   └── tests/               7 files, 42 test cases (vitest + supertest, real DB)
├── apps/frontend/         Next.js 14 App Router + TypeScript + Tailwind
│   └── src/app/            landing, login, register, dashboard, organizations
│                            (+new, +[id], +[id]/members), account, admin
├── packages/shared/        TypeScript enums + Zod schemas, imported by both apps
└── docs/                   ARCHITECTURE, AUTHENTICATION, AUTHORIZATION, DATABASE,
                             API, UI_UX_DESIGN_SYSTEM, TESTING, PHASE_A_SUMMARY,
                             handoff/ (prior master-handoff docs)
```

This is a **modular monolith**: one Express process, one Postgres database, no queue, no cache, no websocket server, no second service of any kind. That's a deliberate, correct choice for the current scope (see Section 25) and I'm not proposing to change it in this phase.

---

## 2. WHAT ALREADY EXISTS (verified)

- User identity: registration, login, logout, password hashing (Argon2id), JWT access tokens, rotating hashed refresh tokens with revocation (`apps/backend/src/lib/refreshTokens.ts`, `jwt.ts`, `password.ts`)
- `PlatformRole` enum: `PLATFORM_ADMIN | CUSTOMER | DRIVER` (`schema.prisma:17`) — `DRIVER` is a role value only; no driver table, no driver-specific code anywhere (confirmed by grep — zero hits outside the enum declaration and unrelated matches)
- `Organization` with `businessType` (`PRODUCER_MANUFACTURER | WHOLESALER | RETAILER | DIRECT_BUSINESS | LOGISTICS_COMPANY`) and `verificationStatus` (`PENDING | VERIFIED | REJECTED`) — `LOGISTICS_COMPANY` is likewise a value only, no logistics tables
- `OrganizationMembership` with `MembershipRole: OWNER | MANAGER | STAFF`, server-enforced org isolation (`apps/backend/src/middleware/organizationAuth.ts`), owner-protection rules (can't demote/remove the last OWNER; `OWNER` role only reachable via explicit ownership transfer, never a plain grant)
- `AuditLog`: generic, append-only, `actorUserId` / `organizationId` / `action` / `targetType` / `targetId` / `metadata` (`schema.prisma:104`) — currently used for exactly one action, `ORGANIZATION_VERIFICATION_UPDATED` (`apps/backend/src/modules/admin/admin.routes.ts`)
- Rate limiting on `/auth/login` and `/auth/register` (in-memory, `express-rate-limit`)
- Frontend: responsive shell (`AppShell.tsx`, sidebar desktop / bottom-nav mobile), auth context holding the access token in memory only (never localStorage — verified in `auth-context.tsx`), pages for the full existing Phase A flow
- Design tokens: exact hex-for-hex match between this brief's palette and `apps/frontend/tailwind.config.ts` / `globals.css` — verified, not assumed
- 42 backend test cases across auth, organizations, memberships, admin (execution status: see the Phase A completion report — real tests, DB-backed, currently blocked from running in *my* sandbox by a network restriction, not a code defect)

## 3. WHAT IS PARTIALLY IMPLEMENTED

| Area | What exists | What's missing |
|---|---|---|
| Verification/KYC | One enum field + one admin `PATCH /organizations/:id/verification` endpoint that flips it | No submission workflow, no documents, no contact/business info beyond `legalName`, no review history, no "needs correction" state (schema only has PENDING/VERIFIED/REJECTED — no `NEEDS_CORRECTION`) |
| Audit logging | Generic `AuditLog` model + `recordAudit()` helper, fire-and-forget-safe, now logs its own failures (Phase A hardening) | Only wired into one action today; no per-domain audit taxonomy yet |
| Admin dashboard | One frontend page (`apps/frontend/src/app/admin/page.tsx`) showing organizations in a table with a verification-status dropdown, backed by real data (no mock data — verified) | None of the 25 sections in this brief beyond a sliver of "Businesses & Onboarding" and "KYC & Verification" |
| Rate limiting | In-memory, per-process, on two routes | Not distributed (breaks once there's more than one backend instance); not applied to any future sensitive write endpoints yet because they don't exist |

## 4. WHAT IS MISSING (confirmed absent by direct search, not assumed)

Business-scoped permissions beyond the 3-value `MembershipRole` enum; business invitation/join-request flow (`packages/shared/src/schemas.ts` even has a code comment stating this was consciously deferred: *"Phase A does not build an email-invitation delivery system"*); products/catalogue/inventory; suppliers/RFQs/quotations/purchase orders; cart/checkout/orders; payments; drivers/deliveries/GPS/tracking; maps; notifications (in-app or push); any event/automation system; disputes/support; analytics; any queue, cache, or websocket infrastructure.

## 5. WHAT CAN BE REUSED

This is the most important section for de-risking Phase 0's new requirements, because almost every hard part already has a proven pattern in this codebase to copy rather than invent:

- **Secure, hashed, revocable tokens with expiry** — `RefreshToken` (`tokenHash`, `expiresAt`, `revokedAt`, atomic conditional-UPDATE rotation) is exactly the pattern the business-invitation link (Section 3 of the brief) needs. Don't invent a new token scheme — reuse this one.
- **Server-side-only authorization, never trusting client-supplied IDs** — `requireOrganizationMembership` middleware already does this correctly for the org boundary; the new business-permission layer (Section 9) extends this middleware, it doesn't replace it.
- **Fire-and-forget audit writes that never block the request** — `recordAudit()` is the template for how any new "log this without risking the primary operation" write should look, including the new KYC review history and notification dispatch.
- **`targetType` / `targetId` string-pair polymorphic reference** — `AuditLog` already uses this instead of a proper FK for "the thing this action was about." The same pattern is the right fit for `Notification.relatedEntityType` / `relatedEntityId` (Section 16) rather than inventing a new polymorphic-association mechanism.
- **Zod schemas shared between frontend and backend via `packages/shared`** — every new domain's validation goes here, same as `packages/shared/src/schemas.ts` today.
- **Design tokens and component patterns** (`AppShell`, `StatusBadge`, `FormAlert`, card/table patterns in `admin/page.tsx`) — the Master Admin Control Center (Section 19) is built by extending these, not by redesigning.

---

## 6. DATABASE DOMAIN MODEL GAP ANALYSIS

All models below are **PROPOSED**, not built. For each: why it exists, what it relates to, what problem it solves.

### 6.1 Business-scoped permissions

**`MembershipPermission`** — `id`, `membershipId → OrganizationMembership`, `resource` (enum: `ORDERS | INVENTORY | PROCUREMENT | PAYMENTS | CATALOGUE | CUSTOMERS | KYC | MEMBERS | SETTINGS`), `level` (enum: `NONE | VIEW | EDIT`), `grantedByUserId → User`, `updatedAt`. Unique on `(membershipId, resource)`.
*Why:* the brief explicitly forbids new platform roles per permission combination ("do NOT create dozens of new platform roles") and asks for a capability layer on top of the existing three membership roles. This is that layer — a row per (member, resource) pair, not a new role enum.
*Relates to:* `OrganizationMembership` (one membership → many permission rows), `User` (who granted it, for audit).
*Problem solved:* the "Member A / B / C" example in the brief is a direct, literal use case for this table — each row is one cell in that table.
*Default behavior (important, must be explicit, not implicit):* `OWNER` is never constrained by this table — same principle as the existing "last owner can't be demoted" rule, just extended: ownership is never a partial-access role. `MANAGER` and `STAFF` get a hardcoded default permission set (defined once in `packages/shared`, e.g., MANAGER defaults to VIEW+EDIT on everything except SETTINGS, STAFF defaults to VIEW-only) that applies when no `MembershipPermission` row exists for a resource — rows only need to be written when the owner *overrides* a default, keeping the common case cheap.

### 6.2 Business invitation / join flow

**`OrganizationInviteLink`** — `id`, `organizationId → Organization`, `tokenHash` (unique, never store the raw token — same as `RefreshToken.tokenHash`), `createdByUserId → User`, `expiresAt`, `maxUses` (nullable), `useCount` (default 0), `revokedAt` (nullable), `createdAt`.
*Why:* a durable, revocable, expiring object behind the shareable link, decoupled from any individual request to join.
*Relates to:* `Organization` (which business), `User` (who created/owns the link, for revocation authorization).
*Problem solved:* "business-specific link" with "expiration, revocation" as explicit requirements.

**`OrganizationJoinRequest`** — `id`, `organizationId → Organization`, `userId → User` (the authenticated requester — never nullable, see security note below), `inviteLinkId → OrganizationInviteLink` (nullable — direct requests without a link are a reasonable future case), `status` (`PENDING | APPROVED | REJECTED`), `reviewedByUserId → User` (nullable), `reviewedAt` (nullable), `createdAt`. Unique on `(organizationId, userId)` where `status = PENDING` (partial unique index — prevents duplicate pending requests from the same person).
*Why:* the request itself is a separate object from the link, exactly matching the brief's flow diagram (link → sign-in/register → **request** → admin approves/rejects → membership created).
*Relates to:* `Organization`, `User`, optionally `OrganizationInviteLink`. On approval, the handler creates an `OrganizationMembership` row (role `STAFF` by default, promotable later) — this table never grants access itself.
*Problem solved:* the brief's explicit critical security requirement — "a person who opens a link must NOT gain access merely by possessing it." Token resolution (`GET /invites/:token` → returns only the organization's public name/logo, nothing else) is a *separate, non-mutating* endpoint from creating a join request (`POST /invites/:token/request`, requires an authenticated session). No membership, and no business data of any kind, is reachable from the link alone.

### 6.3 KYC

**`OrganizationProfile`** (new, 1:1 with `Organization`) — `organizationId` (PK/FK), `contactName`, `contactEmail`, `contactPhone`, `addressLine1`, `city`, `state`, `country`, `description`, `logoUrl`, `updatedAt`.
*Why:* `Organization` today (`schema.prisma:83`) has exactly `legalName`, `businessType`, `status`, `verificationStatus` — none of the "owner/contact information" or "business information" the brief asks for exists yet. Splitting this into its own table (rather than adding a dozen nullable columns to `Organization`) keeps the core identity table — which every authorization check joins against — small and stable, and matches the existing file comment's stated philosophy ("Phase A data foundation... minimal").
*Relates to:* `Organization` (1:1).
*Problem solved:* "business information, owner/contact information."

**`KYCSubmission`** — `id`, `organizationId → Organization`, `submittedByUserId → User`, `status` (`PENDING | APPROVED | REJECTED | NEEDS_CORRECTION` — note this is a *new*, richer enum than the current bare `VerificationStatus`; see migration note below), `reviewerUserId → User` (nullable), `reviewNotes` (nullable), `createdAt`, `updatedAt`.
*Why:* today "verification" is a single mutable field with no evidence of what was ever actually submitted — an admin can flip `VERIFIED` with nothing behind it. This table is the actual workflow object.
*Relates to:* `Organization`, `User` (submitter and reviewer).
*Problem solved:* "submission, pending state, approved/verified state, rejected/needs-correction state."

**`KYCDocument`** — `id`, `kycSubmissionId → KYCSubmission`, `documentType` (enum: `BUSINESS_REGISTRATION | GOVERNMENT_ID | PROOF_OF_ADDRESS | OTHER`), `fileUrl`, `uploadedAt`.
*Why:* documents are a one-to-many under a submission, and need their own type taxonomy.
*Relates to:* `KYCSubmission`.
*Problem solved:* "required verification information/documents."

**`KYCReviewEvent`** — `id`, `kycSubmissionId → KYCSubmission`, `actorUserId → User`, `action` (`SUBMITTED | APPROVED | REJECTED | CORRECTION_REQUESTED | RESUBMITTED`), `notes` (nullable), `createdAt`.
*Why:* "review history" means a sequence of events, not a single final status — this is the specific, user-facing timeline (shown in the org's KYC screen and the admin's drill-down), complementary to the generic `AuditLog` (which stays as the platform-wide security trail and should still get one entry per KYC status change, same as it does today for `ORGANIZATION_VERIFICATION_UPDATED` — the two are not duplicates, they serve different audiences: `KYCReviewEvent` is domain UI, `AuditLog` is platform security).
*Relates to:* `KYCSubmission`, `User`.
*Problem solved:* "review history, audit trail" as two distinct, explicitly named requirements.

*Migration note, flagged honestly:* introducing `NEEDS_CORRECTION` means either extending the existing `VerificationStatus` enum (Postgres supports `ALTER TYPE ... ADD VALUE`, a safe additive migration) or treating `KYCSubmission.status` as its own new enum, independent of `Organization.verificationStatus`. I recommend the latter — keep `Organization.verificationStatus` as the simple, coarse "is this org currently trusted" flag that authorization checks read cheaply (no join needed), and let `KYCSubmission.status` carry the richer workflow state. The two stay in sync via the same service-layer code path that updates both, not via a database trigger.

### 6.4 Notifications

**`Notification`** — `id`, `userId → User`, `type` (enum, the full list from Section 7 of the brief), `title`, `body`, `relatedEntityType` (nullable string, same pattern as `AuditLog.targetType`), `relatedEntityId` (nullable string), `readAt` (nullable), `createdAt`.
*Why:* the in-app notification center and unread-state requirement.
*Relates to:* `User`. Deliberately *not* a hard FK to every possible related entity (order, KYC submission, etc.) — reuses the same loosely-typed reference pattern `AuditLog` already established, for the same reason: the set of "things a notification can be about" will keep growing across every future phase, and a string pair avoids a wide table of nullable FK columns.
*Problem solved:* "notification center, unread state," and the persistence half of "notification persistence."

**`PushSubscription`** — `id`, `userId → User`, `endpoint`, `p256dhKey`, `authKey`, `createdAt`, `lastSeenAt`. Unique on `endpoint`.
*Why:* Web Push (the browser-native, no-vendor-account mechanism — see Section 17) requires storing each browser's subscription object per user per device.
*Relates to:* `User` (one user, many devices/browsers).
*Problem solved:* "browser/device push notification where permission has been granted."

### 6.5 Logistics / drivers (architecture only — see Section 24 for why this is NOT buildable yet)

**`Driver`** (1:1 with `User` where `platformRole = DRIVER`) — vehicle info, license reference (flagged as sensitive PII, needs the same care as KYC documents), current status (`AVAILABLE | ON_DELIVERY | OFFLINE`).
**`Delivery`** — will FK to an `Order` that doesn't exist yet (Phase 5), `driverId`, lifecycle status matching Section 6's driver flow, timestamps per stage, proof-of-delivery reference.
**`DriverLocationPing`** — `driverId`, `deliveryId` (nullable), `latitude`, `longitude`, `recordedAt` (device clock, for out-of-order detection), `receivedAt` (server clock), `accuracyMeters`. **Deliberately short-retention** — see Section 14's privacy/retention discussion; this table is not designed to be an indefinite location history.

These three are named here so the *shape* is on record, but none should be migrated into the database until `Order` exists (Phase 5) — a `Delivery` with no order to attach to is a table with no real foreign key, which is exactly the kind of premature modeling the brief warns against ("Do not over-engineer").

---

## 7. API GAP ANALYSIS

Format per domain: purpose / authorization boundary / expected caller / major data returned / major side effects. `EXISTS` entries reference the real route file.

| Domain | Status | Detail |
|---|---|---|
| Auth (`POST /auth/register`, `/login`, `/logout`, `/refresh`) | **EXISTS** — `apps/backend/src/modules/auth/auth.routes.ts` | Public (register/login), authenticated (logout/refresh). Returns access token + user; sets refresh cookie. Side effect: creates `RefreshToken` row, rotates on refresh. |
| Organizations (`POST /organizations`, `GET /organizations`, `GET /organizations/:id`) | **EXISTS** — `organizations.routes.ts` | Authenticated caller becomes `OWNER` on create. Read scoped to caller's memberships. |
| Memberships (`POST /organizations/:id/members`, `PATCH .../members/:userId`, `DELETE .../members/:userId`) | **EXISTS** | `requireOrganizationMembership` + role checks. `addMemberSchema` explicitly rejects `role: OWNER` (400) — verified in `packages/shared/src/schemas.ts`. |
| Admin — organizations list, verification PATCH | **EXISTS** — `admin.routes.ts` | `requirePlatformAdmin` only. |
| **Business permissions** (`GET/PUT /organizations/:id/members/:userId/permissions`) | **PROPOSED** | Boundary: caller must be `OWNER` (or `MANAGER` with an explicit `MEMBERS: EDIT` permission — careful not to let a MANAGER grant themselves more than they have). Caller: business owner/admin UI. Returns: full `MembershipPermission` set for that member. Side effect: writes `MembershipPermission` rows, emits `AuditLog` entry (`MEMBER_PERMISSIONS_UPDATED`). |
| **Invite links** (`POST /organizations/:id/invite-links`, `DELETE .../invite-links/:id`) | **PROPOSED** | Boundary: `OWNER`/`MANAGER` only. Returns: the raw token **once**, at creation (never again — mirrors how refresh tokens are never re-readable). Side effect: creates `OrganizationInviteLink`. |
| **Invite resolution** (`GET /invites/:token`) | **PROPOSED** | Boundary: **public, unauthenticated** — but returns only `{ organizationName, organizationLogoUrl }`, nothing else. This is the endpoint that makes the security requirement in Section 3 real: it cannot leak membership, business data, or even confirm the token is valid beyond "exists and isn't expired." |
| **Join requests** (`POST /invites/:token/request`, `GET /organizations/:id/join-requests`, `PATCH .../join-requests/:id`) | **PROPOSED** | `POST` requires authentication (any logged-in user). `GET`/`PATCH` require `OWNER`/`MANAGER`. Side effects: `PATCH` approve creates an `OrganizationMembership` + default `MembershipPermission` set + `Notification` to the requester + `AuditLog` entry. |
| **KYC** (`POST /organizations/:id/kyc/submissions`, `GET .../kyc/submissions/:id`, `PATCH .../kyc/submissions/:id/review`) | **PROPOSED** | `POST` requires `OWNER`. `PATCH review` requires `PLATFORM_ADMIN`. Side effects: `PATCH` writes `KYCReviewEvent`, updates `Organization.verificationStatus`, `AuditLog` entry, `Notification` to the org's owner. |
| **Notifications** (`GET /notifications`, `PATCH /notifications/:id/read`, `POST /push-subscriptions`) | **PROPOSED** | Boundary: strictly the authenticated caller's own notifications — never another user's, enforced by `WHERE userId = req.user.id`, never by a client-supplied user ID. |
| Products, catalogue, inventory, RFQs, purchase orders, cart, checkout, orders, payments | **MISSING** (Phase 3/4/5 — outside this phase's scope, unchanged from the earlier handoff) | — |
| Drivers, deliveries, live location | **MISSING**, and correctly so — depends on `Order` (Phase 5) existing first | — |

---

## 8. FRONTEND ROUTE/UI GAP ANALYSIS

| Existing route (`apps/frontend/src/app/...`) | Status |
|---|---|
| `/`, `/login`, `/register`, `/dashboard`, `/account` | **EXISTS** |
| `/organizations`, `/organizations/new`, `/organizations/[id]`, `/organizations/[id]/members` | **EXISTS** |
| `/admin` | **EXISTS** — single table, org list + verification dropdown |

| Proposed new route | Purpose |
|---|---|
| `/organizations/[id]/members/[userId]/permissions` | The Member A/B/C permission editor from Section 2 of the brief |
| `/invites/[token]` | Public invite-resolution page (shows org name/logo + "sign in or register to request to join" — never business data) |
| `/organizations/[id]/join-requests` | Owner/manager approval queue |
| `/organizations/[id]/kyc` | Submission form + status/history timeline |
| `/notifications` | Notification center |
| `/admin/*` (many) | The 25-section Master Admin Control Center — see Section 19 |

All of these are new pages built with the *existing* `AppShell`, `StatusBadge`, `FormAlert`, and table/card patterns already in the codebase — not a new design language.

---

## 9. BUSINESS PERMISSION ARCHITECTURE

Covered in detail in 6.1 and the API table. Summary of the platform-level vs. business-level split (the brief explicitly asks these be distinguished):

**PLATFORM-LEVEL AUTHORITY** — governed entirely by `User.platformRole`. Exactly one privileged value, `PLATFORM_ADMIN`, checked by `requirePlatformAdmin` middleware (`apps/backend/src/middleware/auth.ts`, already `EXISTS`). This controls the Master Admin Control Center and nothing else. A `PLATFORM_ADMIN` is not automatically a member of any organization and does not get organization data through this role — that's `PROPOSED` to stay exactly as strict as it is today (see Section 20).

**BUSINESS-LEVEL PERMISSIONS** — governed by `OrganizationMembership.role` (coarse: OWNER/MANAGER/STAFF, unchanged) layered with `MembershipPermission` rows (fine-grained, `PROPOSED`, Section 6.1). This is entirely separate from platform authority. A `PLATFORM_ADMIN` who is *also* a `STAFF` member of some organization (a real person can be both) is bound by that organization's `MembershipPermission` rows for that organization's data exactly like anyone else — platform authority never implicitly grants business-data access. This mirrors the already-`EXISTS` design decision documented in `docs/AUTHORIZATION.md` that `PLATFORM_ADMIN` intentionally does not bypass `organizationAuth`.

---

## 10. BUSINESS INVITATION ARCHITECTURE

Full token lifecycle (all `PROPOSED`):

1. `OWNER`/`MANAGER` calls `POST /organizations/:id/invite-links` → server generates a cryptographically random token, stores only `sha256(token)` in `OrganizationInviteLink.tokenHash` (raw token is returned in the response body once and never persisted or logged in plaintext — same discipline as refresh tokens today), sets `expiresAt` (short default, e.g. 7 days, configurable).
2. Link shared out-of-band (copy/paste, WhatsApp, email — delivery mechanism itself is out of scope for Phase 0).
3. Anyone opens `/invites/:token` → frontend calls the **public** `GET /invites/:token` → backend hashes the presented token, looks it up, checks `expiresAt`/`revokedAt`/`useCount < maxUses`, and returns **only** `{ organizationName, organizationLogoUrl }` on success, or a generic "this invite is no longer valid" on any failure (expired/revoked/not found are indistinguishable to the caller — same anti-enumeration discipline as the existing login-error design).
4. If the visitor isn't authenticated, frontend routes them to login/register, then back to `/invites/:token`.
5. Authenticated visitor clicks "Request to join" → `POST /invites/:token/request` → server re-validates the token server-side (never trusts anything the client claims about it), creates `OrganizationJoinRequest(status=PENDING)`, increments `useCount`, notifies the org's owners/managers.
6. Owner/manager reviews via `GET /organizations/:id/join-requests`, decides via `PATCH .../join-requests/:id` with `{status: APPROVED|REJECTED}`.
7. On `APPROVED`: creates `OrganizationMembership(role=STAFF)` + default `MembershipPermission` set + `Notification` to the requester + `AuditLog` entry, all in one transaction.

**Abuse prevention:** rate-limit `POST /invites/:token/request` per-IP and per-user (reuse the existing `express-rate-limit` pattern); `maxUses` and `expiresAt` bound a link's blast radius; `revokedAt` lets an owner kill a leaked link immediately without rotating anything else.

---

## 11. KYC ARCHITECTURE

Covered in 6.3. State machine (`PROPOSED`):

```
(no submission) → PENDING → APPROVED
                          → REJECTED
                          → NEEDS_CORRECTION → PENDING (on resubmission)
```

Every transition writes one `KYCReviewEvent` (who, what, when, notes) and one `AuditLog` entry, and updates `Organization.verificationStatus` in the same transaction so the cheap coarse flag and the detailed workflow state never drift apart. Deliberately not modeling anything beyond this — no invented regulatory document types beyond a generic `OTHER`, no jurisdiction-specific rules, per the brief's explicit "do not invent regulatory requirements."

---

## 12. PAYMENT ARCHITECTURE

**MISSING, and correctly deferred** — unchanged from the original handoff's explicit payment boundary (no Paystack, no wallet, no escrow, no settlement). Nothing in this Phase 0 brief asks me to change that, and I haven't touched it. The only forward-looking note worth recording: whatever commission/settlement model eventually gets built (main-account + seller-subaccount, per the earlier handoff) will need `Organization` to carry a `paystackSubaccountCode`-style field — but that's a Phase 5+ concern, not proposed here.

---

## 13. LOGISTICS ARCHITECTURE

At the conceptual level (entities are in 6.5): `Delivery` lifecycle is `ASSIGNED → ACCEPTED → PICKED_UP → IN_TRANSIT → ARRIVED → DELIVERED`, with a `FAILED` branch from any active state. This cannot be built as real, connected tables until `Order` exists (Phase 5) — see Section 26.

---

## 14. REAL-TIME GPS ARCHITECTURE

Driver device → backend:
- Driver's browser/PWA (no separate native app implied by anything in this stack) captures location via the browser Geolocation API only while a delivery is active, on a throttled interval — **not continuous background tracking**, both for battery and for the privacy requirement below.
- Client batches/sends via `POST /deliveries/:id/location` (authenticated as the assigned driver only), payload includes the *device's own timestamp* (`recordedAt`) so the server can detect and discard out-of-order packets (a ping with an earlier `recordedAt` than the latest stored one for that delivery is dropped, not applied) — this directly satisfies "duplicate location events, out-of-order events."
- Server writes a `DriverLocationPing` row and updates a denormalized `lastKnownLocation` (lat/lng/timestamp) directly on `Delivery` for cheap reads — sender/receiver polling or subscribing never has to scan the ping table.

Backend → sender/receiver/admin clients — **this is the one place I'm recommending new infrastructure, and I'm naming it explicitly rather than silently adding it:**
- Given "no fake animated markers" and genuine live tracking is required, plain HTTP polling (e.g., every 5–10s while a delivery is active) is the simplest option that needs **zero new infrastructure** — it works today with nothing but an extra `GET /deliveries/:id/location` endpoint. I recommend starting here.
- If polling latency proves unacceptable once this is actually built and tested, the next step up is a WebSocket layer (`ws` or `socket.io`) added to the existing Express process — still no new *service*, just a new protocol on the same server. I would only reach for a third-party realtime vendor (Pusher/Ably) if self-hosted WebSockets prove operationally painful at whatever scale Market Hub reaches, and I'd document that trade-off explicitly at the time, per the brief's own instruction not to add vendors without justifying them.
- **Authorization:** only the delivery's assigned driver can write location for it; only the order's customer, the fulfilling organization's authorized members (via `MembershipPermission[ORDERS]`), and `PLATFORM_ADMIN` can read it. Never a bare "logged in" check.
- **Staleness:** if no ping has arrived within a configurable window (e.g., 2 minutes) while `Delivery.status` is still active, the frontend shows the last known location with an explicit "last updated Xm ago / driver offline" indicator — it never animates or extrapolates a moving marker from stale data, exactly as instructed.
- **Retention/privacy:** raw `DriverLocationPing` rows are only needed for the life of the delivery plus a short buffer (for dispute resolution) — I'd propose a scheduled cleanup job purging ping rows older than e.g. 30 days, keeping only the final/last-known point on the `Delivery` record long-term. Driver location is never exposed to anyone browsing the platform generally — only to the specific counterparties of that specific active delivery.

---

## 15. MAP INTEGRATION ARCHITECTURE

Not yet chosen — deliberately, per the brief's "document the dependency and why it is required" instruction, this is a decision to make explicitly when Section 14 is actually built, not now. Candidates worth naming for that future decision: Mapbox GL JS (good free tier, no Google account coupling) vs. Google Maps Platform (most familiar, Nigeria coverage is solid, but higher cost at scale). Both are pure frontend-rendering concerns — neither changes the backend GPS architecture above.

---

## 16. NOTIFICATION ARCHITECTURE

Covered in 6.4. Event → recipient mapping (representative subset — the full event list from the brief maps the same way):

| Event | Recipient(s) |
|---|---|
| `BUSINESS_JOIN_REQUESTED` | Org's `OWNER`/`MANAGER` members |
| `JOIN_REQUEST_APPROVED` / `REJECTED` | The requesting user |
| `KYC_SUBMITTED` | `PLATFORM_ADMIN` (all, or a review queue) |
| `KYC_APPROVED` / `REJECTED` | Org's `OWNER` |
| `ORDER_CREATED` / `ACCEPTED` | Seller org's authorized members (`ORDERS: VIEW`+) |
| `DRIVER_ASSIGNED` / `DRIVER_LOCATION_UPDATE` | Order's customer + seller org's authorized members |

In-app delivery: `Notification` row created synchronously by the same service-layer code that performs the underlying action (same transaction where practical, e.g., approving a join request), read via `GET /notifications`, marked via `PATCH /notifications/:id/read`.
Push delivery: if the user has an active `PushSubscription`, the server also sends a Web Push message (VAPID, no vendor account, no Firebase — matching the explicit "DO NOT introduce Firebase" constraint) alongside the in-app row. Push is always a *supplement* to the in-app `Notification`, never a replacement — if push fails or the device is offline, the in-app notification still exists and appears on next login, satisfying "notifications that cannot be delivered while disconnected should be delivered/synchronized when the client reconnects" honestly (the client is what reconnects and fetches, not a promise that a genuinely offline device receives a live push, which the brief correctly says not to claim).
Read/unread state: `readAt IS NULL` = unread, on the `Notification` row directly — no separate join table needed at this scale.

---

## 17. PUSH NOTIFICATION ARCHITECTURE

Web Push (VAPID keys generated once, stored as backend env config) is the concrete recommendation — it's a browser-native standard, requires no new vendor account, and needs nothing beyond `PushSubscription` (6.4) plus a small server-side signing library (`web-push` npm package, well-maintained, MIT licensed). This is a new *dependency* (the brief asks me to justify any new dependency): justification is that it's the only non-vendor-coupled way to deliver browser push, and it directly satisfies the brief's own instruction not to introduce Firebase. Native mobile push (APNs/FCM) is out of scope entirely — there's no native mobile app in this codebase.

---

## 18. AUTOMATION/EVENT ARCHITECTURE

**Recommendation: an in-process, typed event emitter inside the existing Express monolith — not a message queue, not a new service.** This is deliberately the least infrastructure that satisfies the requirement, matching the brief's own "avoid unnecessary microservices, event buses, speculative features, premature infrastructure" instruction and the earlier handoff's identical guidance.

Shape: a small `packages/shared`-adjacent or `apps/backend/src/lib/events.ts` module wrapping Node's built-in `EventEmitter` with typed event names/payloads (e.g., `OrderCreated`, `KYCApproved`, `JoinRequestApproved`). Service-layer code emits an event **after** its own database transaction commits successfully (never before — never let a listener see a state that might still roll back). Listeners registered once at startup handle: writing the appropriate `Notification` row(s), writing the appropriate `AuditLog` entry, and (once WebSockets exist per Section 14) pushing a realtime UI update. This satisfies "without duplicating logic across controllers" — a controller calls one service method; the service method emits one event; every side effect fans out from there instead of being hand-copied into every controller that could trigger it.

**Explicit trigger for when to graduate to real infrastructure (BullMQ+Redis or similar):** the moment any of these become true — (a) the backend runs as more than one process/instance (in-process events don't cross process boundaries), (b) a side effect needs retry-with-backoff semantics (e.g., push delivery to a flaky provider), or (c) a side effect is slow enough to want to happen off the request/response cycle. None of those are true yet. I'm recording this threshold explicitly so the decision is made deliberately later, not defaulted into prematurely now.

**What must stay human-controlled, not automated** (per the brief's own carve-out): anything with financial consequences (payment capture, settlement, refunds — all still `MISSING`/deferred anyway), KYC approval/rejection (a human reviewer decision, automation only handles the *bookkeeping* around that decision — status transition, notification, audit — not the decision itself), and driver assignment where multiple valid drivers exist (dispatch *logic* is a human/business-rule decision; only the resulting state changes are automated).

---

## 19. MASTER ADMIN CONTROL CENTER ARCHITECTURE

Current state: `EXISTS` — one route, one table, two capabilities (list orgs, change verification status). Mapping the 25 requested sections:

| Section | Status | Depends on |
|---|---|---|
| Command Center (overview/metrics) | MISSING | Needs real data from every other domain — mostly a Phase 3+ concern |
| Businesses & Onboarding | PARTIAL | `EXISTS` org list; join-requests view is `PROPOSED` (Section 10) |
| KYC & Verification | PARTIAL | `EXISTS` bare toggle; full workflow is `PROPOSED` (Section 11) |
| Users & Members | MISSING (no dedicated admin user list yet, only via org drill-down) | — |
| Permissions & Access | MISSING | `PROPOSED` (Section 9) |
| Catalogue, Suppliers, Inventory, Procurement, Orders, Payments & Finance | MISSING | Phase 3/4/5 (unchanged scope) |
| Logistics, Drivers, Live Deliveries | MISSING | Phase 5+ Delivery/Driver tables (Section 13) |
| Customers | MISSING | Depends on B2C customer/order data existing |
| Support, Disputes | MISSING | Not designed at all yet — genuinely out of scope for this phase |
| Notifications, Communications | MISSING | `PROPOSED` (Section 16) gives the data; admin view of it is separate future work |
| Audit Logs | PARTIAL | `AuditLog` table `EXISTS` and is written to; no admin UI to browse it yet |
| System Operations, Security | MISSING | Not designed |
| Analytics | MISSING | Needs real transactional data to analyze; nothing to analyze yet |
| Platform Settings, Admin Management | MISSING | No settings/config table exists yet |

The `section → tab → subtab → filters → list/table → detail view → timeline → actions` UI pattern the brief asks for is a real, sensible structure, but building it now — before most of the underlying domains exist — would mean building navigation to nothing. I'm recording the pattern as the agreed shape for when each section's underlying domain exists, not building the shell early.

---

## 20. SECURITY/PRIVACY MODEL

Unchanged principles from the existing, verified-correct Phase A design, extended to new domains:
- Every sensitive read/write authorizes server-side against the database, never a client-supplied org/permission/role claim — same as `organizationAuth` today.
- Platform authority and business authority remain fully separate (Section 9).
- KYC documents and driver location are both flagged here explicitly as **sensitive** categories needing the same care as anything else sensitive in this system: KYC documents should live in access-controlled storage (signed/expiring URLs, not public buckets) once file storage is chosen; driver location is scoped to the active delivery's counterparties only, never broadly queryable, and short-retention (Section 14).
- Notification recipient authorization: a user only ever sees their own `Notification` rows — enforced by `WHERE userId = req.user.id` server-side, exactly mirroring how memberships/organizations are scoped today.

## 21. AUDIT LOGGING MODEL

`AuditLog` (`EXISTS`) remains the single, generic, platform-wide security trail — every new sensitive action (permission changes, join-request approvals, KYC decisions) gets one entry, same shape as the existing `ORGANIZATION_VERIFICATION_UPDATED` action. Domain-specific *history* (like `KYCReviewEvent`) is additive, not a replacement — it's for the domain's own UI timeline; `AuditLog` is for platform security review. Both get written from the same service-layer transaction, never left to drift.

## 22. TESTING STRATEGY

Follows the existing, proven pattern exactly (`apps/backend/tests/`, vitest + supertest against a real Postgres test database, no mocking of Prisma): for each new domain, integration tests for the happy path, the authorization-boundary failure paths (wrong org, wrong permission level, expired/revoked token), and — for the invite-link flow specifically — an explicit test that resolving a token alone never creates a membership or exposes business data, since that's the named critical security requirement.

## 23. IMPLEMENTATION DEPENDENCY GRAPH

```
Business permissions (6.1) ──┐
                              ├──> Everything that checks "can this member see/edit X"
Invitation/join flow (6.2) ──┘     (join-request approval assigns default permissions)

KYC (6.3) ── independent of the above; only needs Organization + User (exist today)

Notifications (6.4) ── needs an event source to be useful; first real consumers are
                        join-request and KYC events, so build the Notification table
                        alongside those, not before them

Master Admin sections ── each section is gated on its underlying domain existing;
                          most sections wait on Phase 3/4/5

Driver/Delivery/GPS (6.5, 13, 14) ── hard-blocked on Order existing (Phase 5)
```

## 24. PHASE-BY-PHASE BUILD ORDER

1. **Phase 0.1** — Business permissions (6.1) + extend `organizationAuth` middleware to check `MembershipPermission`. Smallest, most self-contained, everything else benefits from it existing.
2. **Phase 0.2** — Business invitation/join flow (6.2, Section 10) — reuses the permission defaults from 0.1 when approving.
3. **Phase 0.3** — KYC (6.3, Section 11) — independent, can run in parallel with 0.2 if desired.
4. **Phase 0.4** — Notifications (6.4, Section 16) — wire into 0.2 and 0.3's events first (join-request/KYC), defer push (Section 17) to a follow-up slice.
5. **Phase 0.5** — In-process event/automation layer (Section 18) — introduce once there are at least two real event producers (0.2 and 0.3) so the abstraction is justified by real usage, not speculative.
6. **Then, unchanged from the original handoff:** Phase 3 (products/catalogue/inventory) → Phase 4 (B2B procurement) → Phase 5 (B2C commerce, which is the prerequisite that finally unblocks Driver/Delivery/GPS, Section 13/14) → Master Admin Control Center sections, built out incrementally as each underlying domain lands, rather than as one big effort.

## 25. RISKS / TRADEOFFS

- **In-process events (Section 18) vs. a real queue**: chosen deliberately for now; the explicit graduation trigger is written down (Section 18) so this isn't a silent debt.
- **Polling vs. WebSockets for GPS (Section 14)**: starting with polling is lower-risk and ships faster; revisit only if proven necessary.
- **`MembershipPermission` per-resource-row model vs. a single JSON blob on `OrganizationMembership`**: I chose the relational row-per-resource model because it indexes and audits cleanly (`grantedByUserId`, `updatedAt` per resource) and the resource list is small and stable; a JSON blob would be harder to query ("find everyone with PAYMENTS:VIEW across all orgs") and harder to default sensibly.
- **`OrganizationProfile` as a separate table vs. columns on `Organization`**: separate table costs one extra join on profile reads; benefit is keeping the hot-path identity table (joined on every authorization check) small.

## 26. ITEMS THAT MUST NOT BE IMPLEMENTED YET

Everything in Section 4 that depends on Phase 3/4/5 (products, RFQs, purchase orders, cart, checkout, orders, payments); Driver/Delivery/GPS tables (hard-blocked on Order, Section 24); any payment/wallet/escrow code (explicitly forbidden by both this brief and the earlier handoff); Supabase/Firebase/Lovable-Cloud backend (explicitly forbidden); a second authentication system (explicitly forbidden); any queue/cache/websocket infrastructure until the Section 18/14 graduation triggers are actually met.

## 27. EXACT FIRST IMPLEMENTATION TASK AFTER THIS AUDIT

**Build `MembershipPermission` (6.1) end-to-end as one self-contained slice:** migration, Prisma model, `packages/shared` resource/level enums + default-permission-set constants, `PUT /organizations/:id/members/:userId/permissions` + `GET` counterpart, extend `organizationAuth`/a new `requirePermission(resource, level)` middleware, frontend permission-editor page, and integration tests covering the authorization boundaries (owner can grant, manager without MEMBERS:EDIT cannot, staff cannot see other members' permissions they didn't grant themselves, owner's own access can never be restricted). This is the smallest complete vertical slice, has no dependency on anything else in this document, and everything else in Phase 0 (join-flow default permissions, admin permission views) builds on top of it rather than the reverse.

---

**PHASE 0 STATUS: complete**

**EXACT NEXT COMMAND:** authorize implementation of Section 27 — `MembershipPermission` — as its own controlled, self-contained slice, with the same verify-before-claiming discipline as the Phase A hardening report (real migration against a fresh database, real test execution, honest reporting of what's blocked vs. verified).
