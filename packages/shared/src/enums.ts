/**
 * Enumerations shared between backend and frontend so both sides speak the
 * exact same vocabulary. These mirror the Prisma schema enums 1:1 — keep
 * them in sync when the schema changes.
 */

export const PLATFORM_ROLES = ["PLATFORM_ADMIN", "CUSTOMER", "DRIVER"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const BUSINESS_TYPES = [
  "PRODUCER_MANUFACTURER",
  "WHOLESALER",
  "RETAILER",
  "DIRECT_BUSINESS",
  "LOGISTICS_COMPANY",
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const MEMBERSHIP_ROLES = ["OWNER", "MANAGER", "STAFF"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const VERIFICATION_STATUSES = ["PENDING", "VERIFIED", "REJECTED"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const ACCOUNT_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ORGANIZATION_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

/**
 * Business-scoped permission catalogue (Phase 0.1). This layers fine-grained
 * per-resource access on top of MembershipRole — it does NOT replace it.
 * OWNER is never constrained by this table (see DEFAULT_PERMISSIONS below
 * and organizationAuth middleware); MANAGER/STAFF get sane defaults that a
 * row here can override per resource.
 */
export const PERMISSION_RESOURCES = [
  "ORDERS",
  "INVENTORY",
  "PROCUREMENT",
  "PAYMENTS",
  "CATALOGUE",
  "CUSTOMERS",
  "KYC",
  "MEMBERS",
  "SETTINGS",
] as const;
export type PermissionResource = (typeof PERMISSION_RESOURCES)[number];

export const PERMISSION_LEVELS = ["NONE", "VIEW", "EDIT"] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

/**
 * Default permission level per (MembershipRole, PermissionResource) pair,
 * applied when no explicit MembershipPermission row exists for a member on
 * that resource. OWNER is intentionally absent — OWNER always resolves to
 * EDIT on everything and can never be looked up here (mirrors the existing
 * "last owner can't be demoted" protection: ownership is never a partial or
 * overridable access level).
 */
export const DEFAULT_PERMISSIONS: Record<
  Exclude<MembershipRole, "OWNER">,
  Record<PermissionResource, PermissionLevel>
> = {
  MANAGER: {
    ORDERS: "EDIT",
    INVENTORY: "EDIT",
    PROCUREMENT: "EDIT",
    PAYMENTS: "VIEW",
    CATALOGUE: "EDIT",
    CUSTOMERS: "EDIT",
    KYC: "VIEW",
    MEMBERS: "VIEW",
    SETTINGS: "NONE",
  },
  STAFF: {
    ORDERS: "VIEW",
    INVENTORY: "VIEW",
    PROCUREMENT: "VIEW",
    PAYMENTS: "NONE",
    CATALOGUE: "VIEW",
    CUSTOMERS: "VIEW",
    KYC: "NONE",
    MEMBERS: "NONE",
    SETTINGS: "NONE",
  },
};

/** Ordering used to compare levels, e.g. hasAtLeast(level, "VIEW"). */
export const PERMISSION_LEVEL_RANK: Record<PermissionLevel, number> = {
  NONE: 0,
  VIEW: 1,
  EDIT: 2,
};

/**
 * Business join-request status (Phase 0.2 — see
 * docs/handoff/PHASE_0_MASTER_BLUEPRINT.md §6.2/§10). A request is a
 * separate object from the invite link itself: possessing a link never
 * grants access — it only lets someone start a request, which still
 * requires explicit OWNER/MANAGER approval before a membership is created.
 */
export const JOIN_REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type JoinRequestStatus = (typeof JOIN_REQUEST_STATUSES)[number];

/**
 * KYC workflow status (Phase 2) — separate from VerificationStatus, which
 * stays the simple flag the rest of the app reads. See schema.prisma's
 * KYCStatus doc comment for why these aren't merged into one enum.
 * NOT_STARTED is not a member here — it's the absence of a submission,
 * computed by the onboarding-status endpoint, never stored.
 */
export const KYC_STATUSES = ["DRAFT", "SUBMITTED", "NEEDS_INFORMATION", "VERIFIED", "REJECTED"] as const;
export type KYCStatus = (typeof KYC_STATUSES)[number];

/** Fields required to be filled in before KYC can be submitted. */
export const REQUIRED_PROFILE_FIELDS = [
  "contactEmail",
  "contactPhone",
  "addressLine1",
  "city",
  "country",
] as const;

/**
 * Supplier capability (Phase 3) — separate from BusinessType, see
 * schema.prisma's SupplierCapability doc comment for why.
 */
export const SUPPLIER_CAPABILITIES = [
  "MANUFACTURER",
  "DISTRIBUTOR",
  "WHOLESALER",
  "RETAILER",
  "SERVICE_PROVIDER",
  "OTHER",
] as const;
export type SupplierCapability = (typeof SUPPLIER_CAPABILITIES)[number];

export const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_UNITS = [
  "PIECE",
  "PACK",
  "CARTON",
  "BOX",
  "KILOGRAM",
  "GRAM",
  "LITRE",
  "MILLILITRE",
  "METRE",
  "CASE",
  "OTHER",
] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export const PRICE_TIERS = ["RETAIL", "WHOLESALE", "BUSINESS"] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];

/** Commercial availability — separate axis from ProductStatus, see schema.prisma. */
export const OFFER_AVAILABILITIES = ["AVAILABLE", "OUT_OF_STOCK", "TEMPORARILY_UNAVAILABLE", "DISCONTINUED"] as const;
export type OfferAvailability = (typeof OFFER_AVAILABILITIES)[number];

/**
 * Order lifecycle (Phase 6) — see schema.prisma's OrderStatus doc comment
 * for why there is no PAID/AWAITING_PAYMENT or DELIVERED/SHIPPED state yet.
 * Valid transitions are centralized in orders.service.ts, not here — this
 * is just the closed set of values, never a free-text status.
 */
export const ORDER_STATUSES = ["PENDING", "CONFIRMED", "PROCESSING", "COMPLETED", "CANCELLED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Procurement requisition lifecycle (Phase 7) — see schema.prisma's
 * RequisitionStatus doc comment for why CANCELLED is only reachable from
 * DRAFT/SUBMITTED. Transitions are centralized in requisitions.service.ts.
 */
export const REQUISITION_STATUSES = ["DRAFT", "SUBMITTED", "RFQ_CREATED", "CANCELLED"] as const;
export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number];

/**
 * RFQ lifecycle (Phase 7, extended by Phase 8) — DRAFT -> ISSUED ->
 * AWARDED; see schema.prisma's RfqStatus doc comment for the full
 * rationale, including why there is still no CLOSED/CANCELLED state.
 */
export const RFQ_STATUSES = ["DRAFT", "ISSUED", "AWARDED"] as const;
export type RfqStatus = (typeof RFQ_STATUSES)[number];

/** Per-supplier invitation state on an RFQ (Phase 7). */
export const RFQ_SUPPLIER_TARGET_STATUSES = ["INVITED", "RESPONDED"] as const;
export type RfqSupplierTargetStatus = (typeof RFQ_SUPPLIER_TARGET_STATUSES)[number];

/**
 * Supplier response lifecycle (Phase 7) — see schema.prisma's
 * SupplierResponseStatus doc comment for why WITHDRAWN is terminal (no
 * negotiation/revision semantics exist yet).
 */
export const SUPPLIER_RESPONSE_STATUSES = ["DRAFT", "SUBMITTED", "WITHDRAWN"] as const;
export type SupplierResponseStatus = (typeof SUPPLIER_RESPONSE_STATUSES)[number];

/**
 * Negotiation lifecycle (Phase 8) — OPEN is the only non-terminal state;
 * see schema.prisma's NegotiationStatus doc comment for why ACCEPTED/
 * CLOSED have no reopening path this phase.
 */
export const NEGOTIATION_STATUSES = ["OPEN", "ACCEPTED", "CLOSED"] as const;
export type NegotiationStatus = (typeof NEGOTIATION_STATUSES)[number];

/** Which side authored a negotiation event (Phase 8) — never inferred,
 * always explicit and server-validated. */
export const NEGOTIATION_EVENT_AUTHORS = ["BUYER", "SUPPLIER"] as const;
export type NegotiationEventAuthor = (typeof NEGOTIATION_EVENT_AUTHORS)[number];

/**
 * Purchase order lifecycle (Phase 9) — see schema.prisma's
 * PurchaseOrderStatus doc comment for why there is no CANCELLED state.
 * Transitions are centralized in purchaseOrders.service.ts, never a
 * free-text status.
 */
export const PURCHASE_ORDER_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "CONFIRMED"] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

/** The only supported payment processor (Phase 10) — see schema.prisma's
 * PaymentProvider doc comment. */
export const PAYMENT_PROVIDERS = ["PAYSTACK"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

/**
 * Payment lifecycle (Phase 10) — see schema.prisma's PaymentStatus doc
 * comment for why SUCCESS/FAILED are terminal and a new attempt is a new
 * Payment row, never a retried one. Transitions are centralized in
 * payments.service.ts, never a free-text status. Payment success is a
 * fact about money moving, never about order fulfillment — it does not
 * imply or require any OrderStatus change.
 */
export const PAYMENT_STATUSES = ["PENDING", "PROCESSING", "SUCCESS", "FAILED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Every stock-affecting operation (Phase 11) — see schema.prisma's
 * StockMovementType doc comment for the signed-quantity convention each
 * type follows, and inventory.service.ts for which ones this phase's code
 * actually writes (RESERVATION/RELEASE/SALE/ADJUSTMENT) versus which are
 * modelled only for a future receiving/returns phase (RECEIPT/RETURN).
 */
export const STOCK_MOVEMENT_TYPES = ["RECEIPT", "SALE", "RESERVATION", "RELEASE", "ADJUSTMENT", "RETURN"] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];
