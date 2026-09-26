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
