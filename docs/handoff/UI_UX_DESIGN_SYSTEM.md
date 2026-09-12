# MARKET HUB — MASTER UI/UX DESIGN SYSTEM

## Design goal
Professional, modern, trustworthy and operational. Premium without being flashy. Simple even when the backend is sophisticated.

## Brand palette
Primary Navy: #0B1F33
Primary Market Green: #0F8B6D
Green Dark: #08705A
Warm Gold Accent: #C79A3B
Background: #F7F9FB
Surface: #FFFFFF
Border: #E4E9EF
Text Primary: #17212B
Text Secondary: #667085
Muted: #98A2B3
Success: #17865B
Warning: #B7791F
Danger: #C43D3D
Info: #2563A8

Use mostly neutral surfaces, navy for structure, green for actions, and tiny amounts of gold. Do not make the product gold-heavy or green-heavy.

## Typography
Preferred: Inter.
Fallback: system sans-serif.

Desktop hierarchy:
Display 40–48px
H1 32–40px
H2 24–30px
H3 18–22px
Body 15–16px
Small 13–14px
Caption 12px

## Spacing
Use an 8px rhythm: 4, 8, 12, 16, 24, 32, 40, 48, 64px.

## Radius
Controls 8–10px.
Cards 12–14px.
Large panels 16px.
Use pills mainly for statuses/tags.

## Components
Primary button = green filled.
Secondary = white/neutral with border.
Tertiary = text.
Destructive = danger treatment.

Inputs need visible labels, validation, focus, disabled and helpful errors.

Cards should be used selectively. Do not put everything inside cards.

B2B comparison should use tables where appropriate.

## Status
Use consistent text + subtle semantic color + optional icon. Never use color alone.
Examples: Draft, Pending, Awaiting Payment, Paid, Processing, Ready, Assigned, In Transit, Delivered, Cancelled, Refunded, Disputed.

## Navigation
Navigation must be role-aware and only expose relevant modules. Navigation is not authorization.

Customer: Home, Discover, Orders, Cart, Account.
Business: Overview, Products, Orders, Procurement, Finance, Organization, Settings.
Driver: Available Jobs, Active Delivery, History, Earnings, Profile.
Admin: Overview, Users, Organizations, Verification, Marketplace, Orders, Logistics, Finance, System.

## Responsive behavior
Mobile: thumb-friendly, short forms, clear hierarchy, sticky primary action where useful.
Tablet: two-column layouts where useful.
Desktop: sidebar + workspace + optional contextual panel.
Recommended operational max content width ~1440px.

Check screens at 360, 390, 768, 1024 and 1440px.

## Marketplace
B2C: search, clean product cards, price, seller, delivery, trust and CTA.
B2B: MOQ, unit, quantity/capacity, authorized price, verification, lead time, RFQ/procurement actions.

Never send confidential fields to the frontend just to hide them.

## Checkout
Calm, predictable:
Cart → Delivery Choice → Address if needed → Review → Payment → Confirmation.

Multi-seller checkout visually separates seller orders and subtotals.

## Procurement
B2B should feel like procurement software:
RFQ workspace, quote comparison, supplier rows, MOQ, quantity/unit, requested delivery date, negotiated price, PO/invoice references.

## Logistics
Use a clear timeline:
Order Confirmed → Preparing → Driver Assigned → Picked Up → In Transit → Delivered.

## States
Every important screen needs loading, empty, error, success and disabled states.

## Motion
Restrained. No excessive parallax, floating objects or distracting animation. Respect reduced-motion.

## Accessibility
Target WCAG 2.2 AA principles: semantic HTML, keyboard navigation, visible focus, adequate contrast, labels, accessible dialogs, non-color-only status and suitable touch targets.

## Brand character
African commercial infrastructure with global software quality. Do not rely on flags, clichés or excessive African visual motifs.
