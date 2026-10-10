import { Router } from "express";
import { createPurchaseOrderSchema, purchaseOrderListQuerySchema } from "@market-hub/shared";
import { requireAuth } from "../../middleware/auth";
import { requireOrganizationMembership } from "../../middleware/organizationAuth";
import { validate } from "../../middleware/validate";
import {
  approvePurchaseOrder,
  confirmPurchaseOrder,
  createPurchaseOrderFromAward,
  getPurchaseOrderForViewer,
  listBuyerPurchaseOrders,
  listSupplierPurchaseOrders,
  submitPurchaseOrderForApproval,
} from "./purchaseOrders.service";

/**
 * Mounted at /api/organizations — buyer-side purchase order creation and
 * listing, same :organizationId scoping as rfqs.routes.ts. Creation is
 * nested under the originating RFQ (mirrors the award endpoint) since a PO
 * only ever comes from that RFQ's own Award; MANAGER+ (Phase 9 spec:
 * "MANAGER+ can create PO"). Listing is STAFF+ read access.
 */
export const organizationPurchaseOrdersRouter = Router({ mergeParams: true });

organizationPurchaseOrdersRouter.post(
  "/:organizationId/rfqs/:rfqId/purchase-order",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  validate(createPurchaseOrderSchema),
  async (req, res, next) => {
    try {
      const result = await createPurchaseOrderFromAward(req.params.organizationId, req.params.rfqId, req.user!.id, req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

organizationPurchaseOrdersRouter.get(
  "/:organizationId/purchase-orders",
  requireAuth,
  requireOrganizationMembership("STAFF"),
  validate(purchaseOrderListQuerySchema, "query"),
  async (req, res, next) => {
    try {
      res.status(200).json(await listBuyerPurchaseOrders(req.params.organizationId, req.query as never));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Supplier-side purchase order listing — same shape as rfq-inbox, a
 * separate list from the buyer-side one above since a PO is always scoped
 * to one organization's perspective in a list view.
 */
export const organizationSupplierPurchaseOrdersRouter = Router({ mergeParams: true });

organizationSupplierPurchaseOrdersRouter.get(
  "/:organizationId/supplier-purchase-orders",
  requireAuth,
  requireOrganizationMembership("STAFF"),
  validate(purchaseOrderListQuerySchema, "query"),
  async (req, res, next) => {
    try {
      res.status(200).json(await listSupplierPurchaseOrders(req.params.organizationId, req.query as never));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Mounted at /api/purchase-orders — detail and every lifecycle action,
 * standalone (no :organizationId) because a PO spans two organizations'
 * worth of access, exactly the pattern orders.routes.ts and
 * negotiations.routes.ts already use for the same reason. There is
 * deliberately no generic PATCH /purchase-orders/:id — every transition is
 * its own explicit action endpoint, never a client-chosen arbitrary status.
 */
export const purchaseOrderDetailRouter = Router();

purchaseOrderDetailRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    res.status(200).json(await getPurchaseOrderForViewer(req.params.id, req.user!.id));
  } catch (err) {
    next(err);
  }
});

purchaseOrderDetailRouter.post("/:id/submit-for-approval", requireAuth, async (req, res, next) => {
  try {
    res.status(200).json(await submitPurchaseOrderForApproval(req.params.id, req.user!.id));
  } catch (err) {
    next(err);
  }
});

purchaseOrderDetailRouter.post("/:id/approve", requireAuth, async (req, res, next) => {
  try {
    res.status(200).json(await approvePurchaseOrder(req.params.id, req.user!.id));
  } catch (err) {
    next(err);
  }
});

purchaseOrderDetailRouter.post("/:id/confirm", requireAuth, async (req, res, next) => {
  try {
    res.status(200).json(await confirmPurchaseOrder(req.params.id, req.user!.id));
  } catch (err) {
    next(err);
  }
});
