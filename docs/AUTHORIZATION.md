# Authorization

All authorization is enforced server-side. The frontend hiding a link or
nav item is a UX nicety only — every corresponding API call is
independently gated, and this phase's tests exercise the API directly, not
just the UI, to prove that.

## Platform roles vs. business identity

`User.platformRole` is one of `PLATFORM_ADMIN`, `CUSTOMER`, `DRIVER` —
fixed, and never a stand-in for business identity. A producer, wholesaler,
retailer, direct business or logistics company is represented entirely by
an `Organization.businessType` plus the acting user's membership in that
organization. Registration always creates a `CUSTOMER`-role user,
regardless of whether the person goes on to create a business
organization; creating an organization does not change platform role.

There is no public path to `PLATFORM_ADMIN`. It is only ever set by
`apps/backend/prisma/seed.ts` (see `docs/DATABASE.md`) or a direct database
action — never through the API, and never as a side effect of anything an
organization owner can do. `requirePlatformRole("PLATFORM_ADMIN")` gates
every route in `apps/backend/src/modules/admin/`.

## Organization membership roles

`OWNER` > `MANAGER` > `STAFF`, enforced by
`requireOrganizationMembership(minRole)`
(`apps/backend/src/middleware/organizationAuth.ts`), which:

1. Requires `requireAuth` to have already run.
2. Loads the caller's membership for `:organizationId` **from the
   database** — never from a client-supplied role or organization header.
3. Returns `403` if no membership exists (organization isolation — see
   below) or if the membership's role ranks below `minRole`.

| Action | Minimum role |
| --- | --- |
| View organization / list members | `STAFF` |
| Update organization name | `MANAGER` |
| Add a member | `MANAGER` |
| Change a member's role, remove a member, transfer ownership | `OWNER` |

## Organization isolation

A user with no membership in an organization gets `403` for every
operation on it — including `GET`, and including when the organization
doesn't exist at all. Both cases return the identical `403` so a caller
cannot distinguish "not yours" from "doesn't exist" (tested in
`apps/backend/tests/organizations/organizations.test.ts`).

## Owner protection

- Adding a member directly as `OWNER` is rejected (`400`) — `OWNER` can
  only be granted through the explicit transfer endpoint.
- The last remaining `OWNER` of an organization cannot be demoted or
  removed (`409`) — ownership must be transferred first.
- `POST /organizations/:id/transfer-ownership` sets the target (who must
  already be a member) to `OWNER` and demotes the caller to `MANAGER` in
  the same transaction, so an organization can never end up with zero
  owners or silently accumulate owners through this path.
- A `STAFF` or `MANAGER` cannot promote themselves: the role-change
  endpoint itself requires `OWNER`, so a non-owner caller is rejected
  before any role logic runs at all.

All of the above is covered by
`apps/backend/tests/organizations/memberships.test.ts`.

## Verification

`Organization.verificationStatus` (`PENDING` \| `VERIFIED` \| `REJECTED`)
is a foundation only — this phase does not implement a KYC workflow, just
the field and a `PLATFORM_ADMIN`-only endpoint to change it
(`PATCH /api/admin/organizations/:id/verification`). No organization
member, including `OWNER`, can change their own verification status.
