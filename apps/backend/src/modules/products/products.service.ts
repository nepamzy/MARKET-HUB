import type {
  CreateProductInput,
  OrganizationProductQuery,
  ProductSearchQuery,
  UpdateProductInput,
} from "@market-hub/shared";
import { recordAudit } from "../../lib/audit";
import { AppError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";

const PRICE_SELECT = {
  id: true,
  tier: true,
  minQuantity: true,
  unitPriceMinor: true,
  currency: true,
} as const;

// Nothing in CommercialOffer is sensitive (availability, quantity bounds,
// lead time are all information a buyer legitimately needs), so the same
// select serves both the owner view and the public view. If a future
// internal-only field is added to the model (e.g. cost basis), it must NOT
// be added here — split into owner/public selects at that point, as done
// for Product itself.
const OFFER_SELECT = {
  availability: true,
  maxQuantity: true,
  orderIncrement: true,
  leadTimeDays: true,
  leadTimeNote: true,
} as const;

// Full view for the owning organization — every field, every status.
const OWNER_PRODUCT_SELECT = {
  id: true,
  name: true,
  description: true,
  sku: true,
  categoryId: true,
  category: { select: { id: true, name: true, slug: true } },
  brand: true,
  unit: true,
  status: true,
  isDiscoverable: true,
  minimumOrderQuantity: true,
  primaryImageUrl: true,
  additionalImageUrls: true,
  createdAt: true,
  updatedAt: true,
  prices: { select: PRICE_SELECT },
  commercialOffer: { select: OFFER_SELECT },
} as const;

// What appears in public discovery — same privacy discipline as Phase 3's
// PUBLIC_DIRECTORY_SELECT: never the raw isDiscoverable flag (appearing at
// all already implies it), never anything about the org beyond what the
// directory itself already exposes.
const PUBLIC_PRODUCT_SELECT = {
  id: true,
  name: true,
  description: true,
  categoryId: true,
  category: { select: { id: true, name: true, slug: true } },
  brand: true,
  unit: true,
  minimumOrderQuantity: true,
  primaryImageUrl: true,
  additionalImageUrls: true,
  prices: { select: PRICE_SELECT },
  commercialOffer: { select: OFFER_SELECT },
  organization: {
    select: { id: true, legalName: true, businessType: true, verificationStatus: true, country: true, city: true },
  },
} as const;

/**
 * Cross-field quantity rules that can't live in Zod (the inputs may span
 * a stored value and a newly-submitted one) or in a DB CHECK (they span
 * two tables). Always called with the EFFECTIVE merged values — i.e. new
 * input falling back to whatever is already stored — so an update that
 * only touches maxQuantity is still validated against the stored MOQ.
 */
function assertQuantityConsistency(values: {
  minimumOrderQuantity?: number | null;
  maxQuantity?: number | null;
  orderIncrement?: number | null;
}) {
  const { minimumOrderQuantity: moq, maxQuantity: max, orderIncrement: step } = values;

  if (moq != null && max != null && max < moq) {
    throw AppError.badRequest("Maximum quantity cannot be less than the minimum order quantity");
  }
  // A MOQ that isn't a multiple of the order increment is unsatisfiable as
  // stated (e.g. MOQ 7 with increment 5: 7 is below the first valid
  // quantity above it, 10) — reject rather than store a contradiction that
  // a future cart/order phase would have to guess how to interpret.
  if (moq != null && step != null && moq % step !== 0) {
    throw AppError.badRequest("Minimum order quantity must be a multiple of the order increment");
  }
  if (max != null && step != null && step > max) {
    throw AppError.badRequest("Order increment cannot exceed the maximum quantity");
  }
}

async function assertProductBelongsToOrg(organizationId: string, productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, organizationId }, select: { id: true } });
  if (!product) {
    throw AppError.notFound("Product not found");
  }
}

export async function createProduct(organizationId: string, actorUserId: string, input: CreateProductInput) {
  const { prices, commercialOffer, ...fields } = input;

  assertQuantityConsistency({
    minimumOrderQuantity: fields.minimumOrderQuantity,
    maxQuantity: commercialOffer?.maxQuantity,
    orderIncrement: commercialOffer?.orderIncrement,
  });

  const product = await prisma.product.create({
    data: {
      organizationId,
      ...fields,
      ...(prices ? { prices: { create: prices } } : {}),
      ...(commercialOffer ? { commercialOffer: { create: commercialOffer } } : {}),
    },
    select: OWNER_PRODUCT_SELECT,
  });

  await recordAudit({
    actorUserId,
    organizationId,
    action: "PRODUCT_CREATED",
    targetType: "Product",
    targetId: product.id,
  });

  if (commercialOffer) {
    await recordAudit({
      actorUserId,
      organizationId,
      action: "COMMERCIAL_OFFER_CREATED",
      targetType: "Product",
      targetId: product.id,
      metadata: { availability: commercialOffer.availability ?? "AVAILABLE" },
    });
  }

  return product;
}

export async function listOrganizationProducts(organizationId: string, query: OrganizationProductQuery) {
  const where = {
    organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}),
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: OWNER_PRODUCT_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return { products, page: query.page, pageSize: query.pageSize, total };
}

export async function getOrganizationProduct(organizationId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId },
    select: OWNER_PRODUCT_SELECT,
  });
  if (!product) {
    throw AppError.notFound("Product not found");
  }
  return product;
}

/**
 * Single update entrypoint for name/description/etc., status, and
 * visibility — same pattern as upsertSupplierProfile: one PATCH, with
 * specific additional audit actions fired when status or isDiscoverable
 * actually change, so the audit trail distinguishes "edited a description"
 * from "changed status" without needing three separate endpoints.
 */
export async function updateProduct(
  organizationId: string,
  productId: string,
  actorUserId: string,
  input: UpdateProductInput
) {
  await assertProductBelongsToOrg(organizationId, productId);

  const existing = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    select: {
      status: true,
      isDiscoverable: true,
      minimumOrderQuantity: true,
      commercialOffer: { select: OFFER_SELECT },
    },
  });

  const { prices, commercialOffer: offerInput, ...fields } = input;

  // Validate against the EFFECTIVE merged values: an update that only sets
  // maxQuantity must still be checked against the MOQ already stored, and
  // vice versa. `undefined` means "not part of this request" (fall back to
  // stored); an explicit value replaces it.
  assertQuantityConsistency({
    minimumOrderQuantity: fields.minimumOrderQuantity ?? existing.minimumOrderQuantity,
    maxQuantity: offerInput?.maxQuantity ?? existing.commercialOffer?.maxQuantity,
    orderIncrement: offerInput?.orderIncrement ?? existing.commercialOffer?.orderIncrement,
  });

  const offerData = offerInput
    ? { ...offerInput, leadTimeNote: offerInput.leadTimeNote === "" ? null : offerInput.leadTimeNote }
    : undefined;

  const product = await prisma.$transaction(async (tx) => {
    // `prices`, when supplied, is the COMPLETE new price list (replace, not
    // merge) — which is why the whole-array validation in the Zod schema is
    // sufficient to guarantee the final stored state is consistent.
    if (prices) {
      await tx.productPrice.deleteMany({ where: { productId } });
    }
    return tx.product.update({
      where: { id: productId },
      data: {
        ...fields,
        ...(prices ? { prices: { create: prices } } : {}),
        ...(offerData
          ? { commercialOffer: { upsert: { create: offerData, update: offerData } } }
          : {}),
      },
      select: OWNER_PRODUCT_SELECT,
    });
  });

  await recordAudit({
    actorUserId,
    organizationId,
    action: "PRODUCT_UPDATED",
    targetType: "Product",
    targetId: productId,
    metadata: { fields: Object.keys(input) },
  });

  if (input.status !== undefined && input.status !== existing.status) {
    await recordAudit({
      actorUserId,
      organizationId,
      action: "PRODUCT_STATUS_CHANGED",
      targetType: "Product",
      targetId: productId,
      metadata: { from: existing.status, to: input.status },
    });
  }
  if (input.isDiscoverable !== undefined && input.isDiscoverable !== existing.isDiscoverable) {
    await recordAudit({
      actorUserId,
      organizationId,
      action: "PRODUCT_VISIBILITY_CHANGED",
      targetType: "Product",
      targetId: productId,
      metadata: { isDiscoverable: input.isDiscoverable },
    });
  }

  if (offerInput) {
    await recordAudit({
      actorUserId,
      organizationId,
      action: existing.commercialOffer ? "COMMERCIAL_OFFER_UPDATED" : "COMMERCIAL_OFFER_CREATED",
      targetType: "Product",
      targetId: productId,
      metadata: { fields: Object.keys(offerInput) },
    });

    const previousAvailability = existing.commercialOffer?.availability ?? "AVAILABLE";
    if (offerInput.availability !== undefined && offerInput.availability !== previousAvailability) {
      await recordAudit({
        actorUserId,
        organizationId,
        action: "COMMERCIAL_OFFER_AVAILABILITY_CHANGED",
        targetType: "Product",
        targetId: productId,
        metadata: { from: previousAvailability, to: offerInput.availability },
      });
    }
  }

  if (prices) {
    await recordAudit({
      actorUserId,
      organizationId,
      action: "COMMERCIAL_OFFER_PRICING_CHANGED",
      targetType: "Product",
      targetId: productId,
      metadata: { tierCount: prices.length },
    });
  }

  return product;
}

/**
 * Public discovery — deliberately a single filtered findMany, same "no
 * search engine" discipline as Phase 3's directory search. Only ever
 * returns products that are simultaneously ACTIVE, isDiscoverable=true,
 * AND whose owning organization is ACTIVE.
 */
export async function searchProducts(query: ProductSearchQuery) {
  const where = {
    status: "ACTIVE" as const,
    isDiscoverable: true,
    organization: { status: "ACTIVE" as const },
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(query.brand ? { brand: { equals: query.brand, mode: "insensitive" as const } } : {}),
    ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}),
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: PUBLIC_PRODUCT_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return { products, page: query.page, pageSize: query.pageSize, total };
}

/**
 * Public detail — same anti-enumeration discipline as Phase 3's
 * getDirectoryDetail: a non-existent product and an existent-but-hidden
 * one both return the identical 404, never a distinguishable 403 or a
 * different error shape.
 */
export async function getProductDetail(productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, status: "ACTIVE", isDiscoverable: true, organization: { status: "ACTIVE" } },
    select: PUBLIC_PRODUCT_SELECT,
  });
  if (!product) {
    throw AppError.notFound("Product not found");
  }
  return product;
}

export async function listCategories() {
  return prisma.category.findMany({
    select: { id: true, name: true, slug: true, parentId: true },
    orderBy: { name: "asc" },
  });
}

// --- Platform-admin oversight -------------------------------------------

const ADMIN_PRODUCT_SELECT = {
  id: true,
  name: true,
  status: true,
  isDiscoverable: true,
  createdAt: true,
  organization: { select: { id: true, legalName: true, businessType: true } },
  category: { select: { id: true, name: true } },
} as const;

export async function adminListProducts(page: number, pageSize: number) {
  const [products, total] = await Promise.all([
    prisma.product.findMany({
      select: ADMIN_PRODUCT_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count(),
  ]);
  return { products, page, pageSize, total };
}
