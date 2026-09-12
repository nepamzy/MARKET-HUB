# MARKET HUB — MASTER HANDOFF

## Role
ChatGPT = Master Product Architect.
Claude Code = Software Engineer.

Claude implements one approved phase at a time. ChatGPT audits every cumulative ZIP before the next phase.

## Product
MARKET HUB is focused on **COMMERCE + SUPPLY CHAIN + LOGISTICS**.

Core chain:
Manufacturer/Producer → Wholesaler → Retailer → Customer

Also supported:
Producer/Wholesaler → Direct Business
Seller → Driver/Logistics Provider → Recipient

There is **NO distributor layer** and **NO customer-to-customer marketplace**.

## Participants
- Producer / Manufacturer
- Wholesaler
- Retailer
- Direct Business
- Customer
- Driver / Logistics Provider

Business identity belongs to the Organization, not to a global platform role.

## Platform roles
- PLATFORM_ADMIN
- CUSTOMER
- DRIVER

Organization membership roles:
- OWNER
- MANAGER
- STAFF

Business types:
- PRODUCER_MANUFACTURER
- WHOLESALER
- RETAILER
- DIRECT_BUSINESS
- LOGISTICS_COMPANY

## B2B
B2B is a core capability and should feel like procurement, not ordinary shopping:
RFQs, bulk orders, wholesale pricing, MOQ, recurring procurement, supplier comparison, production capacity, contracts, invoices, purchase orders, negotiated/private pricing, credit foundation and logistics matching.

## B2C
B2C should be simpler: discovery, product detail, cart, checkout, delivery choice and orders.

## Privacy
Commercial visibility is role-aware AND relationship-aware. Retail/wholesale/negotiated/private prices, RFQ responses and private supplier terms must only be visible to authorized parties. Server-side enforcement is mandatory.

## Delivery
If customer declines delivery:
Payment → confirmation → order confirmed.

If customer requests delivery:
Payment → confirmation → address → delivery calculation → driver/logistics assignment → tracking → proof of delivery.

Customers enter a human-readable address. They must NOT manually enter latitude/longitude.

## Logistics
MARKET HUB does not initially own a large fleet. Use a third-party driver/logistics marketplace model.

## Payments
Approved direction:
MARKET HUB main Paystack account + supported seller subaccounts/settlement model.

MARKET HUB pays Paystack processing fees.
No homemade wallet or escrow at launch.
Paystack/KYC behavior must be verified before production implementation.

## Commission
Calculated per seller order using seller goods subtotal only; delivery fees excluded.

- ₦0–₦25,000: 0.75%
- ₦25,001–₦50,000: 1.5%
- ₦50,001–₦500,000: 3%
- ₦500,001–₦2,000,000: 2%
- ₦2,000,001–₦10,000,000: 1%
- ₦10,000,001+: 0.5%

One multi-seller checkout creates independent seller orders; each seller gets its own commission calculation.

## Architecture
Prefer a modular monolith initially. Avoid unnecessary microservices, queues and abstractions.

## Development
Every phase:
1. Read master handoff.
2. Implement only assigned phase.
3. Test actual behavior.
4. Report exact results.
5. Return the complete cumulative project ZIP.
6. STOP.
7. ChatGPT audits.
8. Only after approval does the next phase begin.
