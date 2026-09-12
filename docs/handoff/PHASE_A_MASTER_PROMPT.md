# MARKET HUB — PHASE A MASTER PROMPT

You are Claude Code, the software engineer for MARKET HUB.

Read the full master handoff and permanent rules before coding.

## Objective
Build a secure, clean, production-minded foundation.

## Scope
- repository/project foundation
- environment configuration
- PostgreSQL/Prisma foundation
- real migrations
- users
- authentication
- platform roles
- organizations
- business types
- organization memberships
- server-side authorization
- verification foundation
- admin boundary/foundation
- responsive UI foundation
- tests
- documentation

## Platform roles
PLATFORM_ADMIN, CUSTOMER, DRIVER.

Do NOT create producer/wholesaler/retailer/distributor platform roles.

## Business types
PRODUCER_MANUFACTURER, WHOLESALER, RETAILER, DIRECT_BUSINESS, LOGISTICS_COMPANY.

No distributor.

## Membership
OWNER, MANAGER, STAFF.

## Authentication
Registration, login, logout, secure password hashing, account status, secure session/token strategy and validation as appropriate. Do not overengineer.

## Organization
Organization model, business type, status, ownership and memberships.

## Authorization
Enforce authentication, platform role, membership, membership role and organization ownership/protection server-side. Cross-organization access must be denied.

## Verification
Create only a future-ready foundation. Do not invent detailed KYC requirements.

## Admin
Create a secure platform-admin boundary. Do not build the complete admin system yet.

## UI
Follow UI_UX_DESIGN_SYSTEM.md. Build a real MARKET HUB visual foundation:
- auth screens
- application shell
- responsive navigation
- organization onboarding/selection foundation
- forms
- buttons
- inputs
- alerts
- loading/empty/error states
- restrained status badges

Visual hierarchy: neutral background + deep navy structure + market green actions + restrained gold accent.

Do not create a generic starter dashboard.

## Strict exclusions
Do NOT build:
products, catalogue, inventory, marketplace search, cart, checkout, RFQs, purchase orders, invoices, Paystack, commission, seller settlement, driver matching, delivery pricing, tracking, logistics marketplace, subscriptions or advanced analytics.

## Security
Secure password storage, input validation, server-side authorization, organization isolation, owner protection, no sensitive credential commits, no client-trusted roles/organization IDs.

## Testing
Run appropriate unit/integration/API tests plus typecheck, lint and build. Report exact commands/results.

If database runtime cannot be reached, say BLOCKED. Never fabricate success.

## Definition of done
Foundation, migrations, auth, organization/membership authorization, verification foundation, admin boundary, responsive UI foundation, security, tests, typecheck/lint/build results and documentation are all actually implemented/verified to the degree reported.

## Final handoff
Return:
- Phase Status: IMPLEMENTED / VERIFIED / BLOCKED
- Built
- Database
- API
- Auth
- Authorization
- UI/UX
- Security
- Exact tests/results
- Build/typecheck/lint results
- Known issues
- Decisions needed
- COMPLETE cumulative project ZIP

Then STOP. Do not start Phase B.
