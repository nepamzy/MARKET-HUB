# Organizations

An organization is the business entity that participates in MARKET HUB —
a producer/manufacturer, wholesaler, retailer, direct business, or
logistics company. See `docs/handoff/README.md` for the product framing
and `docs/AUTHORIZATION.md` for how access to an organization's data is
controlled.

## Model

- `legalName`, `businessType` (fixed at creation — see below),
  `status` (`ACTIVE` \| `SUSPENDED`), `verificationStatus`
  (`PENDING` \| `VERIFIED` \| `REJECTED`).
- Business types: `PRODUCER_MANUFACTURER`, `WHOLESALER`, `RETAILER`,
  `DIRECT_BUSINESS`, `LOGISTICS_COMPANY`. No `DISTRIBUTOR` type exists —
  this is a fixed product boundary, not an oversight.
- Membership roles: `OWNER`, `MANAGER`, `STAFF`.

## Creating an organization

`POST /api/organizations` — any authenticated user can create one. The
creator becomes its sole `OWNER` (creation and the first membership row
are written in one transaction, so an organization can never exist without
an owner). `businessType` cannot be changed after creation in this phase —
changing it has implications for later phases (catalogue eligibility,
procurement rules) that haven't been decided yet, so the API simply
doesn't expose a way to change it rather than guessing at a policy.

## Membership

- `POST /api/organizations/:id/members` adds an **already-registered**
  user by email as `STAFF` or `MANAGER`. This phase does not send email
  invitations — that would need SMTP/paid email infrastructure out of
  scope for Phase A (Rule 4) — so the target user must already have a
  MARKET HUB account. A future phase can add an invitation flow without
  changing this endpoint's contract.
- Role changes and removal require `OWNER` — see `docs/AUTHORIZATION.md`
  for the exact rules (owner protection, no self-promotion).
- There is currently no dedicated frontend control for the ownership
  transfer endpoint (`POST /api/organizations/:id/transfer-ownership`) —
  it is fully implemented and tested on the API
  (`apps/backend/tests/organizations/memberships.test.ts`), but the
  members page UI doesn't yet expose a "transfer ownership" action. This
  is a known, minor UI gap for a later polish pass, not a missing
  capability.

## What's deliberately not here yet

Per the strict Phase A exclusions: no products, catalogue, inventory,
orders, RFQs, purchase orders, invoices, payments, commission, or
logistics on the organization model. Those are later phases
(`docs/handoff/PHASE_ROADMAP.md`) and will attach to `Organization` as
foreign keys the same way `OrganizationMembership` does today — the
foundation here does not need to change shape to accommodate them.
