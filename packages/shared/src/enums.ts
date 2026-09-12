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
