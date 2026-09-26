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
