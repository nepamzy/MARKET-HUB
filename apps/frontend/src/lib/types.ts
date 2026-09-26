import type {
  AccountStatus,
  BusinessType,
  MembershipRole,
  OrganizationStatus,
  PermissionLevel,
  PermissionResource,
  PlatformRole,
  VerificationStatus,
} from "@market-hub/shared";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  platformRole: PlatformRole;
  accountStatus: AccountStatus;
  createdAt: string;
}

export interface Organization {
  id: string;
  legalName: string;
  businessType: BusinessType;
  status: OrganizationStatus;
  verificationStatus: VerificationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationWithRole extends Organization {
  membershipRole: MembershipRole;
}

export interface Member {
  id: string;
  role: MembershipRole;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

export interface MemberPermissions {
  role: MembershipRole;
  permissions: Record<PermissionResource, PermissionLevel>;
}

export interface InviteLink {
  id: string;
  inviteeEmail: string | null;
  role: MembershipRole;
  expiresAt: string;
  maxUses: number | null;
  useCount: number;
  revokedAt: string | null;
  createdAt: string;
}

export interface JoinRequest {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  reviewedAt: string | null;
  user: { id: string; name: string; email: string };
}

export interface OrganizationProfile {
  id: string;
  legalName: string;
  businessType: BusinessType;
  verificationStatus: VerificationStatus;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  description: string | null;
  registrationNumber: string | null;
}

export type KYCStatusValue = "DRAFT" | "SUBMITTED" | "NEEDS_INFORMATION" | "VERIFIED" | "REJECTED";

export interface OnboardingStatus {
  profile: OrganizationProfile;
  profileComplete: boolean;
  missingFields: string[];
  kyc: {
    status: KYCStatusValue;
    submittedAt: string | null;
    reviewedAt: string | null;
    reviewNote: string | null;
    reviewedByName: string | null;
  } | null;
}

export interface KycSubmissionSummary {
  id: string;
  status: KYCStatusValue;
  submittedAt: string | null;
  reviewedAt: string | null;
  organization: { id: string; legalName: string; businessType: BusinessType };
}

export interface KycSubmissionDetail extends KycSubmissionSummary {
  reviewNote: string | null;
  submittedBy: { id: string; name: string; email: string } | null;
  reviewedBy: { id: string; name: string } | null;
  organization: OrganizationProfile;
}

export type SupplierCapabilityValue = "MANUFACTURER" | "DISTRIBUTOR" | "WHOLESALER" | "RETAILER" | "SERVICE_PROVIDER" | "OTHER";

export interface SupplierProfile {
  capabilities: SupplierCapabilityValue[];
  categories: string[];
  countriesServed: string[];
  regionsServed: string[];
  citiesServed: string[];
  minimumOrderInfo: string | null;
  isActive: boolean;
  isDiscoverable: boolean;
  updatedAt: string;
}

export interface DirectoryListing {
  id: string;
  legalName: string;
  businessType: BusinessType;
  verificationStatus: VerificationStatus;
  country: string | null;
  state: string | null;
  city: string | null;
  description: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  supplierProfile: {
    capabilities: SupplierCapabilityValue[];
    categories: string[];
    countriesServed: string[];
    regionsServed: string[];
    citiesServed: string[];
    minimumOrderInfo: string | null;
  };
}

export interface AdminDirectoryEntry {
  id: string;
  legalName: string;
  businessType: BusinessType;
  status: OrganizationStatus;
  verificationStatus: VerificationStatus;
  country: string | null;
  city: string | null;
  supplierProfile: {
    capabilities: SupplierCapabilityValue[];
    categories: string[];
    isActive: boolean;
    isDiscoverable: boolean;
    updatedAt: string;
  } | null;
}
