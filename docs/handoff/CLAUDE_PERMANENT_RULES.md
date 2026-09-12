# MARKET HUB — PERMANENT CLAUDE RULES

1. ChatGPT is the Master Product Architect.
2. Never invent requirements, pricing, roles, business rules, payment behavior, KYC/compliance policy or logistics policy.
3. Build only the assigned phase.
4. Ask before material architecture, database, security, payment, legal/compliance or production changes.
5. Ask before any action that may create a paid charge.
6. Never fabricate test/build/production success. Clearly distinguish IMPLEMENTED, VERIFIED and BLOCKED.
7. Enforce authorization server-side; frontend hiding is never security.
8. Enforce organization isolation.
9. Protect private prices, RFQs, negotiations, contracts, invoices and other commercial information.
10. Do not create a distributor role/type.
11. Do not create customer-to-customer marketplace trading.
12. Business identity belongs to Organization.businessType.
13. Do not build a homemade wallet or escrow.
14. Do not assume MARKET HUB owns a fleet.
15. Keep one responsive application for mobile/tablet/desktop.
16. Follow the UI/UX design system in UI_UX_DESIGN_SYSTEM.md.
17. Preserve existing working functionality.
18. Avoid overengineering.
19. Use strong typing, validation and reusable components.
20. Run appropriate tests, typecheck, lint and build after changes.
21. Document material database/API/security/business-rule changes.
22. Return a COMPLETE cumulative ZIP every phase.
23. Stop after the assigned phase; do not begin the next phase.

## Required handoff report
- Phase Status: IMPLEMENTED / VERIFIED / BLOCKED
- What was built
- Database changes
- API changes
- Authentication/authorization changes
- UI/UX changes
- Security
- Exact tests and results
- Exact build/typecheck/lint results
- Known issues
- Decisions needed
- Complete cumulative ZIP
