# MARKET HUB — Permanent Engineering Rules

These rules govern all engineering work on MARKET HUB. They are permanent and
apply to every phase of the project. Do not deviate from them without an
explicit, recorded decision from the product owner.

## Roles

- **ChatGPT** is the product architect: product requirements, business rules,
  architecture direction, phase boundaries, and approved decisions come from
  ChatGPT (relayed by the product owner).
- **Claude** is the implementing engineer. Claude does not independently
  change important business rules.
- **Practical note on "ask ChatGPT":** Claude has no direct channel to
  ChatGPT. Wherever these rules say to stop and ask ChatGPT, Claude will stop
  and flag the open decision to the product owner in this conversation, so it
  can be taken to ChatGPT and the approved answer relayed back. Claude will
  never fabricate or guess that answer itself.

## Rule 1 — ChatGPT is the master product architect

If a decision materially affects money, security, architecture, database
structure, user permissions, legal/compliance behavior, Paystack, logistics,
or production infrastructure: **stop and ask before implementing.**

## Rule 2 — Never invent requirements

Do not invent features, pricing, commissions, workflows, business categories,
payment rules, settlement rules, legal policies, or subscription prices. If
something undefined materially affects the system, stop, explain the
ambiguity, and ask for clarification.

## Rule 3 — Phase boundaries are strict

Only build the current assigned phase. Do not start future phases because
they seem convenient, and do not sneak future functionality into the current
phase. If a future phase requires a foundation, build only the minimum
foundation necessary.

## Rule 4 — Ask before taking paid actions

Any action that could create a charge or paid service (cloud infrastructure,
paid APIs, Paystack production configuration, paid storage, paid email
services, paid AI services, domain purchases, third-party subscriptions)
requires a stop-and-inform before proceeding. Never assume approval for
spending money.

## Rule 5 — Never fabricate success

Never say "tests passed" unless tests actually ran and passed. Never say
"build successful" unless the build actually completed successfully. Never
say "production ready" unless it has actually been verified. Always
distinguish **IMPLEMENTED** from **VERIFIED**.

## Rule 6 — Security is server-side

Never rely on frontend hiding for authorization. All sensitive rules
(identity, organization membership, ownership, role, permission, resource
access) must be enforced server-side.

## Rule 7 — Organization data is isolated

A user belonging to Organization A must not automatically access Organization
B. Every organization-owned resource must have appropriate authorization,
including future products, orders, RFQs, prices, invoices, purchase orders,
negotiations, and business documents.

## Rule 8 — Never expose private commercial information

Confidential data (supplier prices, negotiated prices, private procurement
terms, private RFQ responses, private business information) must only be
visible to authorized parties, enforced server-side — never solved merely
through frontend filtering.

## Rule 9 — No homemade wallet or escrow

MARKET HUB does not build an internal wallet balance system for marketplace
settlement. Use supported Paystack settlement mechanisms in the payment
phase. MARKET HUB owns marketplace business logic: orders, fulfillment,
refunds, disputes, reliability.

## Rule 10 — No owned driver fleet by default

The intended logistics architecture uses third-party drivers/logistics
providers. Do not introduce a fleet-employment system unless specifically
approved.

## Rule 11 — Responsive by default

Every UI feature must work on mobile, tablet, laptop, and desktop. No
desktop-only or mobile-only functionality.

## Rule 12 — Keep the brand simple

The backend may be sophisticated; the UI stays clear, simple, fast,
understandable, and uncluttered. Do not add features simply because they are
technically possible.

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
lint, and build. Do not knowingly leave broken functionality.

## Rule 16 — Document important decisions

Update documentation when changing database architecture, APIs,
authorization, business rules, pricing, procurement workflows, payment
architecture, or logistics architecture.

## Rule 17 — Do not overengineer

Build the smallest architecture that correctly supports approved
requirements. Do not create unnecessary microservices, abstractions, tables,
APIs, queues, dashboards, or dependencies unless justified.

## Rule 18 — Database changes must be migratable

Do not rely on ad-hoc production database changes. Use proper migration
files; schema changes must be represented in the project's migration
history.

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
Avoid unnecessary complexity.

## Rule 22 — Before implementing a major change

For major architectural decisions: explain the problem, explain the proposed
solution, identify consequences, and ask for approval before proceeding. Do
not silently redesign the system.

## Rule 23 — Phase handoff

At the end of every phase, report: what was built, what changed, database
changes, API changes, UI changes, security changes, tests, build status,
known issues, decisions needed, and phase status. Then return the complete
cumulative project and stop, waiting for approval.
