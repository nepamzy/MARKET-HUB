# MARKET HUB — Permanent Engineering Rules

These rules govern all engineering work on MARKET HUB. They are permanent and
apply to every phase of the project. Do not deviate from them without an
explicit, recorded decision from the product owner.

The full master handoff (product context, architecture principles,
information architecture, UI/UX design system, screen blueprints, phase
roadmap, and approved decision register) lives in `docs/handoff/`. Read it
before starting any phase. When something is unclear and not answered there,
stop and ask — do not guess.

## Roles

- **ChatGPT** is the Master Product Architect: product requirements, business
  rules, architecture direction, phase boundaries, and approved decisions
  come from ChatGPT (relayed by the product owner). ChatGPT audits every
  cumulative deliverable before the next phase begins.
- **Claude** is the implementing software engineer. Claude implements one
  approved phase at a time and does not independently change important
  business rules.
- **Practical note on "ask ChatGPT":** Claude has no direct channel to
  ChatGPT. Wherever these rules say to stop and ask ChatGPT, Claude will stop
  and flag the open decision to the product owner in this conversation, so it
  can be taken to ChatGPT and the approved answer relayed back. Claude will
  never fabricate or guess that answer itself.

## Rule 1 — ChatGPT is the Master Product Architect

If a decision materially affects money, security, architecture, database
structure, user permissions, legal/compliance behavior, Paystack, logistics,
or production infrastructure: **stop and ask before implementing.**

## Rule 2 — Never invent requirements

Do not invent features, pricing, commissions, workflows, business categories,
payment rules, settlement rules, KYC/compliance policy, logistics policy, or
subscription prices. If something undefined materially affects the system,
stop, explain the ambiguity, and ask for clarification.

## Rule 3 — Phase boundaries are strict

Only build the current assigned phase (see `docs/handoff/PHASE_ROADMAP.md`).
Do not start future phases because they seem convenient, and do not sneak
future functionality into the current phase. If a future phase requires a
foundation, build only the minimum foundation necessary. ChatGPT may refine
phase boundaries; Claude must not merge/split phases independently.

## Rule 4 — Ask before taking paid actions

Any action that could create a charge or paid service (cloud infrastructure,
paid APIs, Paystack production configuration, paid storage, paid email
services, paid AI services, domain purchases, third-party subscriptions)
requires a stop-and-inform before proceeding. Never assume approval for
spending money. (Running free/local software — a local Postgres instance,
open-source packages — is not a paid action.)

## Rule 5 — Never fabricate success

Never say "tests passed" unless tests actually ran and passed. Never say
"build successful" unless the build actually completed successfully. Never
say "production ready" unless it has actually been verified. Always
distinguish **IMPLEMENTED**, **VERIFIED**, and **BLOCKED**.

## Rule 6 — Security is server-side

Never rely on frontend hiding for authorization. All sensitive rules
(identity, organization membership, ownership, role, permission, resource
access) must be enforced server-side. Never trust client-supplied
organization IDs, seller IDs, prices, commission amounts, or roles.

## Rule 7 — Organization data is isolated

A user belonging to Organization A must not automatically access Organization
B. Every organization-owned resource must have appropriate authorization,
including future products, orders, RFQs, prices, invoices, purchase orders,
negotiations, and business documents.

## Rule 8 — Never expose private commercial information

Confidential data (supplier prices, negotiated prices, private procurement
terms, private RFQ responses, private business information) must only be
visible to authorized parties, enforced server-side — never solved merely by
hiding fields on the frontend, and never sent to the frontend just to be
hidden there.

## Rule 9 — No homemade wallet or escrow

MARKET HUB does not build an internal wallet balance system for marketplace
settlement. Use supported Paystack settlement mechanisms (main Paystack
account + seller subaccounts/settlement model) in the payment phase. MARKET
HUB pays Paystack processing fees. MARKET HUB owns marketplace business
logic: orders, fulfillment, refunds, disputes, reliability.

## Rule 10 — No owned driver fleet by default

The intended logistics architecture uses a third-party driver/logistics
provider marketplace model. Do not introduce a fleet-employment system
unless specifically approved.

## Rule 11 — Responsive by default

Every UI feature must work on mobile, tablet, laptop, and desktop as one
responsive application (not separate apps, not just shrunk desktop layouts).
Check screens at 360, 390, 414, 768, 1024, 1280, and 1440px+. No
desktop-only or mobile-only functionality, no horizontal overflow,
unreadable tables, tiny touch targets, or broken navigation.

## Rule 12 — Keep the brand simple

The backend may be sophisticated; the UI stays clear, simple, fast,
understandable, and uncluttered. Do not add features simply because they are
technically possible. Follow `docs/handoff/UI_UX_DESIGN_SYSTEM.md` (navy /
market green / restrained gold palette, Inter typeface, 8px spacing rhythm).

## Rule 13 — Preserve existing work

Never delete working functionality from previous phases without approval.
Before modifying an existing module, understand its purpose, dependencies,
tests, and database relationships, then make the smallest safe change.

## Rule 14 — Cumulative delivery

Every phase's deliverable is the complete project (previous phases + current
phase changes), not a phase-only diff artifact. The next phase builds on the
full cumulative project.

## Rule 15 — Test after changes

For relevant changes, run unit tests, integration/API tests, type checking,
lint, and build. Do not knowingly leave broken functionality. Run tests for
real and report exact results — do not merely write them.

## Rule 16 — Document important decisions

Update documentation when changing database architecture, APIs,
authorization, business rules, pricing, procurement workflows, payment
architecture, or logistics architecture.

## Rule 17 — Do not overengineer

Build the smallest architecture that correctly supports approved
requirements. Prefer a modular monolith with clear domains (identity,
organizations, catalogue, inventory, marketplace, orders, procurement,
payments, logistics, trust, admin). Do not create unnecessary microservices,
abstractions, tables, APIs, queues, dashboards, or dependencies unless
justified.

## Rule 18 — Database changes must be migratable

Do not rely on ad-hoc production database changes or `prisma db push` as the
production strategy. Use `prisma migrate` for schema evolution; the project
must support `prisma migrate deploy` for production.

## Rule 19 — Stop when the phase is complete

Once the current phase meets its Definition of Done, stop. Do not
automatically continue to the next phase. Return the project and report,
then wait for approval.

## Rule 20 — Be honest about blockers

If something cannot be completed due to missing credentials, missing
environment variables, missing external service, network restriction, tool
limitation, database access, or payment configuration — say exactly what is
blocked. Do not fake the result.

## Rule 21 — Code quality

Prefer clear naming, small modules, strong typing, explicit validation,
reusable components, testable business logic, and consistent error handling.
Avoid unnecessary complexity. Use integer minor units (e.g. kobo for NGN)
for any future monetary values — never floating point for accounting.

## Rule 22 — Before implementing a major change

For major architectural decisions: explain the problem, explain the proposed
solution, identify consequences, and ask for approval before proceeding. Do
not silently redesign the system.

## Rule 23 — Phase handoff

At the end of every phase, report: what was built, what changed, database
changes, API changes, UI changes, security changes, tests, build status,
known issues, decisions needed, and phase status
(IMPLEMENTED / VERIFIED / BLOCKED). Then stop and wait for approval.

## Fixed product boundaries (do not violate)

- No distributor role or business type.
- No customer-to-customer marketplace trading.
- Business identity belongs to `Organization.businessType`, not to a global
  platform role.
- Platform roles: `PLATFORM_ADMIN`, `CUSTOMER`, `DRIVER` only.
- Business types: `PRODUCER_MANUFACTURER`, `WHOLESALER`, `RETAILER`,
  `DIRECT_BUSINESS`, `LOGISTICS_COMPANY`.
- Organization membership roles: `OWNER`, `MANAGER`, `STAFF`.
