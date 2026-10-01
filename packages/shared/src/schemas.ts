import { z } from "zod";
import {
  BUSINESS_TYPES,
  MEMBERSHIP_ROLES,
  OFFER_AVAILABILITIES,
  PERMISSION_RESOURCES,
  PRICE_TIERS,
  PRODUCT_STATUSES,
  PRODUCT_UNITS,
  SUPPLIER_CAPABILITIES,
  VERIFICATION_STATUSES,
} from "./enums";

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

/**
 * Business profile update (Phase 2). All optional — a business can save
 * partial progress. Empty string is treated as "clear the field" by the
 * service layer, not rejected here, so a user can remove a value they
 * previously entered.
 */
export const updateOrganizationProfileSchema = z.object({
  contactName: z.string().max(200).optional(),
  contactEmail: z.string().email().max(200).optional().or(z.literal("")),
  contactPhone: z.string().max(50).optional(),
  addressLine1: z.string().max(300).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  description: z.string().max(2000).optional(),
  registrationNumber: z.string().max(100).optional(),
});
export type UpdateOrganizationProfileInput = z.infer<typeof updateOrganizationProfileSchema>;

/**
 * Platform-admin KYC review decision. `note` is required for anything other
 * than VERIFIED — a rejection or information request with no explanation
 * is not actionable for the business on the other end.
 */
export const reviewKycSchema = z
  .object({
    decision: z.enum(["VERIFIED", "REJECTED", "NEEDS_INFORMATION"]),
    note: z.string().max(2000).optional(),
  })
  .refine((body) => body.decision === "VERIFIED" || Boolean(body.note?.trim()), {
    message: "A note is required when rejecting or requesting more information",
    path: ["note"],
  });
export type ReviewKycInput = z.infer<typeof reviewKycSchema>;

/**
 * Supplier profile update (Phase 3). Arrays are capped to keep the payload
 * and the eventual directory-index size bounded without needing a real
 * taxonomy table yet — "clean database-backed filtered search," per the
 * spec, not a search engine. Free-text country/region/city strings
 * (validated only for length, never against a fixed country list) keep
 * this Africa-wide-ready rather than Nigeria-only.
 */
const boundedStringArray = (maxItems: number, maxLength: number) =>
  z.array(z.string().min(1).max(maxLength)).max(maxItems);

export const updateSupplierProfileSchema = z.object({
  capabilities: z.array(z.enum(SUPPLIER_CAPABILITIES)).max(10).optional(),
  categories: boundedStringArray(30, 80).optional(),
  countriesServed: boundedStringArray(60, 80).optional(),
  regionsServed: boundedStringArray(60, 80).optional(),
  citiesServed: boundedStringArray(100, 80).optional(),
  minimumOrderInfo: z.string().max(500).optional().or(z.literal("")),
  isActive: z.boolean().optional(),
  isDiscoverable: z.boolean().optional(),
});
export type UpdateSupplierProfileInput = z.infer<typeof updateSupplierProfileSchema>;

export const directorySearchQuerySchema = z.object({
  businessType: z.enum(BUSINESS_TYPES).optional(),
  capability: z.enum(SUPPLIER_CAPABILITIES).optional(),
  country: z.string().max(80).optional(),
  state: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  category: z.string().max(80).optional(),
  verificationStatus: z.enum(VERIFICATION_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type DirectorySearchQuery = z.infer<typeof directorySearchQuerySchema>;

/**
 * Product create/update (Phase 4). A single schema for both — create
 * requires `name`; update makes everything optional via .partial() at the
 * route layer's call site is avoided in favor of two explicit schemas so
 * required-on-create fields stay genuinely required.
 */
const productPriceInputSchema = z.object({
  tier: z.enum(PRICE_TIERS),
  minQuantity: z.number().int().min(1).default(1),
  unitPrice: z.number().positive(),
  // ISO 4217, e.g. "NGN", "KES", "GHS", "USD" -- validated for shape only,
  // never defaulted, so no currency is silently assumed for any market.
  currency: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/, "currency must be a 3-letter ISO 4217 code"),
});

/**
 * Deterministic pricing rules (Phase 5 §7F), enforced server-side on the
 * whole `prices` array at once — none of these can be checked on a single
 * price row in isolation:
 *  1. No duplicate (tier, minQuantity) breakpoint. Phase 4's DB unique
 *     constraint already forbids it, but only as a raw constraint
 *     violation; catching it here returns a clean 400 instead.
 *  2. One currency per product. A product priced RETAIL in NGN and
 *     WHOLESALE in KES has no comparable tiers and is almost certainly a
 *     data-entry mistake.
 *  3. Within a tier, unit price must not INCREASE as the quantity
 *     breakpoint rises. Because this model stores breakpoints (qty >= N
 *     -> price P) rather than explicit [min,max] ranges, ranges can never
 *     structurally overlap — what CAN go wrong is a "volume discount"
 *     that costs more per unit at higher volume, which is contradictory.
 *     Deliberately strict; relax explicitly if a real surcharge use case
 *     ever appears rather than silently permitting it now.
 */
const productPricesSchema = z
  .array(productPriceInputSchema)
  .max(20)
  .superRefine((prices, ctx) => {
    const seen = new Set<string>();
    for (const [i, p] of prices.entries()) {
      const key = `${p.tier}:${p.minQuantity}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i],
          message: `Duplicate price breakpoint for ${p.tier} at quantity ${p.minQuantity}`,
        });
      }
      seen.add(key);
    }

    const currencies = new Set(prices.map((p) => p.currency));
    if (currencies.size > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "All prices for one product must use the same currency",
      });
    }

    for (const tier of PRICE_TIERS) {
      const tierPrices = prices.filter((p) => p.tier === tier).sort((a, b) => a.minQuantity - b.minQuantity);
      for (let i = 1; i < tierPrices.length; i++) {
        if (tierPrices[i]!.unitPrice > tierPrices[i - 1]!.unitPrice) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${tier} unit price must not increase as quantity increases`,
          });
          break;
        }
      }
    }
  });

/**
 * Commercial offer fields (Phase 5). Only what Product doesn't already
 * carry (unit and minimumOrderQuantity stay on Product). The cross-field
 * rule maxQuantity >= Product.minimumOrderQuantity can't be expressed here
 * since minimumOrderQuantity may already be stored from an earlier request
 * — it's checked in products.service.ts against the effective merged value.
 */
const commercialOfferInputSchema = z.object({
  availability: z.enum(OFFER_AVAILABILITIES).optional(),
  maxQuantity: z.number().int().positive().optional(),
  orderIncrement: z.number().int().positive().optional(),
  leadTimeDays: z.number().int().min(0).max(3650).optional(),
  leadTimeNote: z.string().max(300).optional(),
});

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(3000).optional(),
  sku: z.string().max(100).optional(),
  categoryId: z.string().uuid().optional(),
  brand: z.string().max(120).optional(),
  unit: z.enum(PRODUCT_UNITS).optional(),
  minimumOrderQuantity: z.number().int().min(1).optional(),
  primaryImageUrl: z.string().url().max(2000).optional(),
  additionalImageUrls: z.array(z.string().url().max(2000)).max(10).optional(),
  prices: productPricesSchema.optional(),
  commercialOffer: commercialOfferInputSchema.optional(),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial().extend({
  status: z.enum(PRODUCT_STATUSES).optional(),
  isDiscoverable: z.boolean().optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productSearchQuerySchema = z.object({
  search: z.string().max(200).optional(),
  categoryId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  brand: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ProductSearchQuery = z.infer<typeof productSearchQuerySchema>;

// For an organization's own catalogue view -- unlike public discovery,
// includes filtering by status since owners manage drafts/archives too.
export const organizationProductQuerySchema = z.object({
  status: z.enum(PRODUCT_STATUSES).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type OrganizationProductQuery = z.infer<typeof organizationProductQuerySchema>;
