import type { DirectorySearchQuery, UpdateSupplierProfileInput } from "@market-hub/shared";
import { recordAudit } from "../../lib/audit";
import { AppError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";

// What an OWNER/MANAGER of the business sees when managing their own
// profile — includes the visibility/active flags themselves.
const OWNER_SUPPLIER_SELECT = {
  capabilities: true,
  categories: true,
  countriesServed: true,
  regionsServed: true,
  citiesServed: true,
  minimumOrderInfo: true,
  isActive: true,
  isDiscoverable: true,
  updatedAt: true,
} as const;

// What appears in a public directory listing/detail — never the visibility
// flags themselves (appearing in results already implies isDiscoverable
// was true; no need to also expose the boolean), never anything KYC- or
// membership-related. This is the one place that decides what "designated
// as discoverable" actually means on the wire — see kyc.service.ts's
// PROFILE_SELECT for the contrast (that one includes registrationNumber
// and full contact detail, appropriate for the business's own view and
// platform-admin review, neither of which this is).
const PUBLIC_DIRECTORY_SELECT = {
  id: true,
  legalName: true,
  businessType: true,
  verificationStatus: true,
  country: true,
  state: true,
  city: true,
  description: true,
  contactEmail: true,
  contactPhone: true,
  supplierProfile: {
    select: {
      capabilities: true,
      categories: true,
      countriesServed: true,
      regionsServed: true,
      citiesServed: true,
      minimumOrderInfo: true,
    },
  },
} as const;

function emptyStringToNull<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value === "" ? null : value])
  ) as T;
}

export async function getSupplierProfile(organizationId: string) {
  const profile = await prisma.supplierProfile.findUnique({
    where: { organizationId },
    select: OWNER_SUPPLIER_SELECT,
  });
  // Absence is a normal state (never configured yet), not an error —
  // mirrors how KYCSubmission absence means NOT_STARTED, not a 404.
  return profile;
}

export async function upsertSupplierProfile(
  organizationId: string,
  actorUserId: string,
  input: UpdateSupplierProfileInput
) {
  const existing = await prisma.supplierProfile.findUnique({
    where: { organizationId },
    select: { isDiscoverable: true },
  });
  const data = emptyStringToNull(input);

  const updated = await prisma.supplierProfile.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
    select: OWNER_SUPPLIER_SELECT,
  });

  await recordAudit({
    actorUserId,
    organizationId,
    action: existing ? "SUPPLIER_PROFILE_UPDATED" : "SUPPLIER_PROFILE_CREATED",
    targetType: "SupplierProfile",
    targetId: organizationId,
    metadata: { fields: Object.keys(input) },
  });

  // A visibility change is meaningful enough on its own (it's what
  // actually controls whether this business becomes findable) to get its
  // own audit action in addition to the general update entry, per the
  // spec's explicit "supplier visibility changed" event.
  if (input.isDiscoverable !== undefined && input.isDiscoverable !== (existing?.isDiscoverable ?? false)) {
    await recordAudit({
      actorUserId,
      organizationId,
      action: "SUPPLIER_VISIBILITY_CHANGED",
      targetType: "SupplierProfile",
      targetId: organizationId,
      metadata: { isDiscoverable: input.isDiscoverable },
    });
  }

  return updated;
}

/**
 * Directory search — deliberately a single filtered findMany, not a search
 * engine (Phase 3 spec §5: "a clean database-backed filtered search is
 * sufficient"). Only ever returns organizations that are simultaneously:
 * ACTIVE (org-level), and have a SupplierProfile with isActive=true and
 * isDiscoverable=true. A business that has never configured a supplier
 * profile at all never appears — there's nothing to discover.
 */
export async function searchDirectory(query: DirectorySearchQuery) {
  const where = {
    status: "ACTIVE" as const,
    ...(query.businessType ? { businessType: query.businessType } : {}),
    ...(query.country ? { country: { equals: query.country, mode: "insensitive" as const } } : {}),
    ...(query.state ? { state: { equals: query.state, mode: "insensitive" as const } } : {}),
    ...(query.city ? { city: { equals: query.city, mode: "insensitive" as const } } : {}),
    ...(query.verificationStatus ? { verificationStatus: query.verificationStatus } : {}),
    supplierProfile: {
      isActive: true,
      isDiscoverable: true,
      ...(query.capability ? { capabilities: { has: query.capability } } : {}),
      ...(query.category ? { categories: { has: query.category } } : {}),
    },
  };

  const [organizations, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      select: PUBLIC_DIRECTORY_SELECT,
      orderBy: { legalName: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.organization.count({ where }),
  ]);

  return { organizations, page: query.page, pageSize: query.pageSize, total };
}

/**
 * Public detail view. Returns the same "not found" for a non-existent
 * organization and for one that exists but isn't currently discoverable —
 * never distinguishing the two, so a caller can't use this endpoint to
 * enumerate private organizations by ID (same anti-enumeration discipline
 * used for invite tokens and login errors elsewhere in this codebase).
 */
export async function getDirectoryDetail(organizationId: string) {
  const org = await prisma.organization.findFirst({
    where: {
      id: organizationId,
      status: "ACTIVE",
      supplierProfile: { isActive: true, isDiscoverable: true },
    },
    select: PUBLIC_DIRECTORY_SELECT,
  });
  if (!org) {
    throw AppError.notFound("Business not found");
  }
  return org;
}

// --- Platform-admin (admin.routes.ts) ---------------------------------

const ADMIN_DIRECTORY_SELECT = {
  id: true,
  legalName: true,
  businessType: true,
  status: true,
  verificationStatus: true,
  country: true,
  city: true,
  supplierProfile: {
    select: {
      capabilities: true,
      categories: true,
      isActive: true,
      isDiscoverable: true,
      updatedAt: true,
    },
  },
} as const;

export async function adminListDirectory(page: number, pageSize: number) {
  const [organizations, total] = await Promise.all([
    prisma.organization.findMany({
      select: ADMIN_DIRECTORY_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.organization.count(),
  ]);
  return { organizations, page, pageSize, total };
}

/** Admin override — can force a profile hidden (or restore it) regardless
 * of the business's own preference, e.g. for a policy violation. Requires
 * a SupplierProfile to already exist; an admin can't create one on a
 * business's behalf. */
export async function adminSetDirectoryVisibility(
  organizationId: string,
  adminUserId: string,
  isDiscoverable: boolean
) {
  const existing = await prisma.supplierProfile.findUnique({ where: { organizationId } });
  if (!existing) {
    throw AppError.notFound("This business has not configured a supplier profile");
  }

  const updated = await prisma.supplierProfile.update({
    where: { organizationId },
    data: { isDiscoverable },
    select: OWNER_SUPPLIER_SELECT,
  });

  await recordAudit({
    actorUserId: adminUserId,
    organizationId,
    action: "SUPPLIER_VISIBILITY_CHANGED",
    targetType: "SupplierProfile",
    targetId: organizationId,
    metadata: { isDiscoverable, setByPlatformAdmin: true },
  });

  return updated;
}
