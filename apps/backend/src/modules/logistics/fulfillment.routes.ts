import { Router } from "express";
import { dispatchFulfillmentSchema, fulfillmentExceptionSchema, fulfillmentListQuerySchema } from "@market-hub/shared";
import { requireAuth } from "../../middleware/auth";
import { requireOrganizationMembership } from "../../middleware/organizationAuth";
import { validate } from "../../middleware/validate";
import {
  createFulfillment,
  dispatchFulfillment,
  getFulfillmentForOrder,
  getFulfillmentForViewer,
  listFulfillmentsForOrganization,
  markFulfillmentException,
  markFulfillmentPacked,
  startProcessingFulfillment,
} from "./fulfillment.service";

/** Mounted at /api/orders — buyer-or-seller resolved per-order, same
 * pattern as orderPaymentsRouter. */
export const orderFulfillmentRouter = Router({ mergeParams: true });
orderFulfillmentRouter.use(requireAuth);

orderFulfillmentRouter.get("/:orderId/fulfillment", async (req, res, next) => {
  try {
    res.status(200).json({ fulfillment: await getFulfillmentForOrder(req.params.orderId, req.user!.id) });
  } catch (err) {
    next(err);
  }
});

orderFulfillmentRouter.post("/:orderId/fulfillment", async (req, res, next) => {
  try {
    res.status(201).json({ fulfillment: await createFulfillment(req.params.orderId, req.user!.id) });
  } catch (err) {
    next(err);
  }
});

/** Mounted at /api/organizations — seller-side list, same STAFF-read
 * boundary as every other org-scoped resource. */
export const organizationFulfillmentsRouter = Router({ mergeParams: true });

organizationFulfillmentsRouter.get(
  "/:organizationId/fulfillments",
  requireAuth,
  requireOrganizationMembership("STAFF"),
  validate(fulfillmentListQuerySchema, "query"),
  async (req, res, next) => {
    try {
      const { status, page, pageSize } = req.query as unknown as { status?: Parameters<typeof listFulfillmentsForOrganization>[1]; page: number; pageSize: number };
      res.status(200).json(await listFulfillmentsForOrganization(req.params.organizationId, status, page, pageSize));
    } catch (err) {
      next(err);
    }
  }
);

/** Mounted at /api/fulfillments — standalone detail + actions, resolved
 * per-fulfillment (spans the seller org and the order's buyer), same
 * pattern as purchaseOrderDetailRouter/negotiationDetailRouter. */
export const fulfillmentDetailRouter = Router();
fulfillmentDetailRouter.use(requireAuth);

fulfillmentDetailRouter.get("/:fulfillmentId", async (req, res, next) => {
  try {
    res.status(200).json({ fulfillment: await getFulfillmentForViewer(req.params.fulfillmentId, req.user!.id) });
  } catch (err) {
    next(err);
  }
});

fulfillmentDetailRouter.post("/:fulfillmentId/start-processing", async (req, res, next) => {
  try {
    res.status(200).json({ fulfillment: await startProcessingFulfillment(req.params.fulfillmentId, req.user!.id) });
  } catch (err) {
    next(err);
  }
});

fulfillmentDetailRouter.post("/:fulfillmentId/pack", async (req, res, next) => {
  try {
    res.status(200).json({ fulfillment: await markFulfillmentPacked(req.params.fulfillmentId, req.user!.id) });
  } catch (err) {
    next(err);
  }
});

fulfillmentDetailRouter.post(
  "/:fulfillmentId/dispatch",
  validate(dispatchFulfillmentSchema),
  async (req, res, next) => {
    try {
      res.status(200).json({ fulfillment: await dispatchFulfillment(req.params.fulfillmentId, req.user!.id, req.body) });
    } catch (err) {
      next(err);
    }
  }
);

fulfillmentDetailRouter.post(
  "/:fulfillmentId/exception",
  validate(fulfillmentExceptionSchema),
  async (req, res, next) => {
    try {
      res.status(200).json({ fulfillment: await markFulfillmentException(req.params.fulfillmentId, req.user!.id, req.body.reason) });
    } catch (err) {
      next(err);
    }
  }
);
