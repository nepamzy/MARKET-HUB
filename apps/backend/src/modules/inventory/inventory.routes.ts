import { Router } from "express";
import { adjustInventorySchema, stockMovementListQuerySchema } from "@market-hub/shared";
import { requireAuth } from "../../middleware/auth";
import { requireOrganizationMembership } from "../../middleware/organizationAuth";
import { validate } from "../../middleware/validate";
import {
  adjustInventory,
  getProductInventoryDetail,
  listInventoryForOrganization,
  listStockMovements,
} from "./inventory.service";

const paginationSchema = stockMovementListQuerySchema;

/** Mounted at /api/organizations — read for any active member, write
 * (adjustments) for MANAGER+, the same boundary products.routes.ts uses.
 * Ownership is enforced inside the service layer (assertProductBelongsToOrg),
 * not just by the membership check, so a member of org A can never reach
 * org B's inventory even by guessing a product ID in the URL. */
export const organizationInventoryRouter = Router({ mergeParams: true });

organizationInventoryRouter.use(requireAuth);

organizationInventoryRouter.get(
  "/:organizationId/inventory",
  requireOrganizationMembership("STAFF"),
  validate(paginationSchema, "query"),
  async (req, res, next) => {
    try {
      const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
      res.status(200).json(await listInventoryForOrganization(req.params.organizationId, page, pageSize));
    } catch (err) {
      next(err);
    }
  }
);

organizationInventoryRouter.get(
  "/:organizationId/products/:productId/inventory",
  requireOrganizationMembership("STAFF"),
  async (req, res, next) => {
    try {
      res.status(200).json(await getProductInventoryDetail(req.params.organizationId, req.params.productId));
    } catch (err) {
      next(err);
    }
  }
);

organizationInventoryRouter.get(
  "/:organizationId/products/:productId/inventory/movements",
  requireOrganizationMembership("STAFF"),
  validate(paginationSchema, "query"),
  async (req, res, next) => {
    try {
      const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
      res
        .status(200)
        .json(await listStockMovements(req.params.organizationId, req.params.productId, page, pageSize));
    } catch (err) {
      next(err);
    }
  }
);

organizationInventoryRouter.post(
  "/:organizationId/products/:productId/inventory/adjustments",
  requireOrganizationMembership("MANAGER"),
  validate(adjustInventorySchema),
  async (req, res, next) => {
    try {
      const inventory = await adjustInventory(
        req.params.organizationId,
        req.params.productId,
        req.user!.id,
        req.body.quantityChange,
        req.body.reason
      );
      res.status(200).json({ inventory });
    } catch (err) {
      next(err);
    }
  }
);
