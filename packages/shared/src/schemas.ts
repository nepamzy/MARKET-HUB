import { z } from "zod";
import { BUSINESS_TYPES, MEMBERSHIP_ROLES, PERMISSION_RESOURCES } from "./enums";

/**
 * Request contracts shared between the API and the frontend forms that
 * submit to it. Keeping validation identical on both sides means the
 * frontend can give instant feedback while the backend remains the source
 * of truth (Rule 6 — security/validation is server-side; the frontend copy
 * of this schema is a UX convenience only, never a trust boundary).
 */

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[0-9]/, "Password must include a number");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  email: emailSchema,
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number")
    .max(20)
    .optional()
    .or(z.literal("")),
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const createOrganizationSchema = z.object({
  legalName: z.string().trim().min(2, "Organization name must be at least 2 characters").max(160),
  businessType: z.enum(BUSINESS_TYPES),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

/**
 * Adds an already-registered user to an organization directly by email.
 * Phase A does not build an email-invitation delivery system (that would
 * require SMTP/paid email infra out of scope for this phase) — the target
 * user must already have a MARKET HUB account.
 */
export const addMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(MEMBERSHIP_ROLES).exclude(["OWNER"], {
    message: "New members cannot be added directly as OWNER",
  }),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.enum(MEMBERSHIP_ROLES),
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export const transferOwnershipSchema = z.object({
  newOwnerUserId: z.string().uuid("newOwnerUserId must be a valid UUID"),
});
export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>;

/**
 * Business-scoped permission update (Phase 0.1). Body is a partial map of
 * resource -> level; only the resources present are changed, so an owner
 * can flip one permission without resending the whole set. OWNER-role
 * members reject this at the route level (their access is never a table
 * lookup) rather than in this schema, to keep the 400 message specific.
 */
const permissionLevelSchema = z.enum(["NONE", "VIEW", "EDIT"]);

export const updateMemberPermissionsSchema = z
  .object({
    ORDERS: permissionLevelSchema.optional(),
    INVENTORY: permissionLevelSchema.optional(),
    PROCUREMENT: permissionLevelSchema.optional(),
    PAYMENTS: permissionLevelSchema.optional(),
    CATALOGUE: permissionLevelSchema.optional(),
    CUSTOMERS: permissionLevelSchema.optional(),
    KYC: permissionLevelSchema.optional(),
    MEMBERS: permissionLevelSchema.optional(),
    SETTINGS: permissionLevelSchema.optional(),
  } satisfies Record<(typeof PERMISSION_RESOURCES)[number], z.ZodOptional<typeof permissionLevelSchema>>)
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    message: "At least one permission must be provided",
  });
export type UpdateMemberPermissionsInput = z.infer<typeof updateMemberPermissionsSchema>;

/**
 * Invite-link creation (Phase 0.2). Both bounds are optional but at least
 * one of expiresInDays/maxUses should normally be set by the frontend
 * default — the schema itself doesn't force that, since an OWNER may
 * deliberately want an unbounded internal link. maxUses, if given, must be
 * a positive integer; expiresInDays is capped at a generous but finite
 * window to avoid an effectively-permanent forgotten link.
 */
export const createInviteLinkSchema = z.object({
  expiresInDays: z.number().int().min(1).max(90).optional().default(7),
  maxUses: z.number().int().min(1).max(10_000).optional(),
});
export type CreateInviteLinkInput = z.infer<typeof createInviteLinkSchema>;

export const reviewJoinRequestSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});
export type ReviewJoinRequestInput = z.infer<typeof reviewJoinRequestSchema>;
