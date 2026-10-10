import { Router } from "express";
import { cancelOrderSchema, orderListQuerySchema } from "@market-hub/shared";
import { AppError } from "../../lib/errors";
import { requireAuth } from "../../middleware/auth";
import { requireOrganizationMembership } from "../../middleware/organizationAuth";
import { validate } from "../../middleware/validate";
import {
  cancelOrder,
  checkout,
  completeOrder,
  confirmOrder,
  getOrderForViewer,
  listBuyerOrders,
  listSellerOrders,
  startProcessingOrder,
} from "./orders.service";

/** Mounted at /api/checkout. */
export const checkoutRouter = Router();

checkoutRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const result = await checkout(req.user!.id);
    if (result.status === "empty_cart") {
      throw AppError.badRequest("Your cart is empty");
    }
    if (result.status === "already_checked_out") {
      // The atomic-claim race (Phase 6 §18) — a duplicate submission for
      // the same cart, not a client error about the request shape.
      throw AppError.conflict("This checkout was already completed");
    }
    res.status(201).json({ orders: result.orders });
  } catch (err) {
    next(err);
  }
});

/** Mounted at /api/orders — the caller's own orders as a buyer. */
export const ordersRouter = Router();

ordersRouter.use(requireAuth);

ordersRouter.get("/", validate(orderListQuerySchema, "query"), async (req, res, next) => {
  try {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    res.status(200).json(await listBuyerOrders(req.user!.id, page, pageSize));
  } catch (err) {
    next(err);
  }
});

ordersRouter.get("/:orderId", async (req, res, next) => {
  try {
    res.status(200).json(await getOrderForViewer(req.params.orderId, req.user!.id));
  } catch (err) {
    next(err);
  }
});

ordersRouter.post("/:orderId/confirm", async (req, res, next) => {
  try {
    res.status(200).json(await confirmOrder(req.params.orderId, req.user!.id));
  } catch (err) {
    next(err);
  }
});

ordersRouter.post("/:orderId/start-processing", async (req, res, next) => {
  try {
    res.status(200).json(await startProcessingOrder(req.params.orderId, req.user!.id));
  } catch (err) {
    next(err);
  }
});

ordersRouter.post("/:orderId/complete", async (req, res, next) => {
  try {
    res.status(200).json(await completeOrder(req.params.orderId, req.user!.id));
  } catch (err) {
    next(err);
  }
});

ordersRouter.post("/:orderId/cancel", validate(cancelOrderSchema), async (req, res, next) => {
  try {
    res.status(200).json(await cancelOrder(req.params.orderId, req.user!.id, req.body.reason));
  } catch (err) {
    next(err);
  }
});

/**
 * Mounted at /api/organizations — the seller-side view of orders placed
 * against one specific organization. Reuses the existing single-org
 * membership middleware directly, unlike the buyer-or-seller endpoints
 * above, because this one genuinely is scoped to exactly one
 * :organizationId the normal way.
 */
export const organizationOrdersRouter = Router({ mergeParams: true });

organizationOrdersRouter.get(
  "/:organizationId/orders",
  requireAuth,
  requireOrganizationMembership("STAFF"),
  validate(orderListQuerySchema, "query"),
  async (req, res, next) => {
    try {
      const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
      res.status(200).json(await listSellerOrders(req.params.organizationId, page, pageSize));
    } catch (err) {
      next(err);
    }
  }
);
