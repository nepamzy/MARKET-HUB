import { Router } from "express";
import {
  createProductSchema,
  organizationProductQuerySchema,
  productSearchQuerySchema,
  updateProductSchema,
} from "@market-hub/shared";
import { requireAuth } from "../../middleware/auth";
import { requireOrganizationMembership } from "../../middleware/organizationAuth";
import { validate } from "../../middleware/validate";
import {
  createProduct,
  getOrganizationProduct,
  getProductDetail,
  listCategories,
  listOrganizationProducts,
  searchProducts,
  updateProduct,
} from "./products.service";

/** Mounted at /api/organizations — read for any active member, write for
 * MANAGER+, same boundary as the rest of this codebase's org-scoped
 * resources. Ownership is enforced inside the service layer
 * (assertProductBelongsToOrg / the WHERE clause itself), not just by the
 * membership check, so a member of org A can never reach org B's product
 * even by guessing an ID in the URL. */
export const organizationProductsRouter = Router({ mergeParams: true });

organizationProductsRouter.post(
  "/:organizationId/products",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  validate(createProductSchema),
  async (req, res, next) => {
    try {
      const result = await createProduct(req.params.organizationId, req.user!.id, req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

organizationProductsRouter.get(
  "/:organizationId/products",
  requireAuth,
  requireOrganizationMembership("STAFF"),
  validate(organizationProductQuerySchema, "query"),
  async (req, res, next) => {
    try {
      res.status(200).json(await listOrganizationProducts(req.params.organizationId, req.query as never));
    } catch (err) {
      next(err);
    }
  }
);

organizationProductsRouter.get(
  "/:organizationId/products/:productId",
  requireAuth,
  requireOrganizationMembership("STAFF"),
  async (req, res, next) => {
    try {
      res.status(200).json(await getOrganizationProduct(req.params.organizationId, req.params.productId));
    } catch (err) {
      next(err);
    }
  }
);

organizationProductsRouter.patch(
  "/:organizationId/products/:productId",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  validate(updateProductSchema),
  async (req, res, next) => {
    try {
      const result = await updateProduct(req.params.organizationId, req.params.productId, req.user!.id, req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Mounted at /api/products — public/platform discovery, requireAuth only
 * (any logged-in user, not org-scoped), same conservative default as
 * Phase 3's directory: no unauthenticated path yet since there's no B2C
 * storefront to justify opening it further.
 */
export const publicProductsRouter = Router();

publicProductsRouter.get("/", requireAuth, validate(productSearchQuerySchema, "query"), async (req, res, next) => {
  try {
    res.status(200).json(await searchProducts(req.query as never));
  } catch (err) {
    next(err);
  }
});

publicProductsRouter.get("/:productId", requireAuth, async (req, res, next) => {
  try {
    res.status(200).json(await getProductDetail(req.params.productId));
  } catch (err) {
    next(err);
  }
});

/** Mounted at /api/categories — read-only, any authenticated user. */
export const categoriesRouter = Router();

categoriesRouter.get("/", requireAuth, async (_req, res, next) => {
  try {
    res.status(200).json(await listCategories());
  } catch (err) {
    next(err);
  }
});
