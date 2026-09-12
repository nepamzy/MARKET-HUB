# MARKET HUB — ARCHITECTURE PRINCIPLES

## Initial architecture
Prefer a modular monolith with clear domains:
identity, organizations, catalogue, inventory, marketplace, orders, procurement, payments, logistics, trust and admin.

## Data
Users belong to the platform and participate in organizations through memberships. Business type belongs to Organization.

## Security
Never trust client-supplied organization IDs, seller IDs, prices, commission amounts or roles.

## Money
Use integer minor units (e.g. kobo for NGN) for monetary accounting. Never use floating point for accounting.

## Orders
A multi-seller checkout must decompose into seller-specific orders. This supports seller-specific payment routing, commission and fulfillment while keeping one customer checkout.

## Address
Human-readable address is the primary customer input. Coordinates are internal enrichment.

## Payment
No homemade wallet/escrow. Payment webhook processing must be idempotent.

## Logistics
Order fulfillment and logistics are related but distinct domains.

## Auditability
Important financial, security and administrative actions should have an audit trail.

## API
Consistent validation, authentication, authorization, errors and pagination. Do not leak private fields.

## UI
Frontend consumes server-authorized data only.
