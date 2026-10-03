import { Router } from "express";
import { addRfqSupplierTargetsSchema, awardRfqSchema, createRfqSchema, rfqListQuerySchema } from "@market-hub/shared";
import { requireAuth } from "../../middleware/auth";
import { requireOrganizationMembership } from "../../middleware/organizationAuth";
import { validate } from "../../middleware/validate";
import {
  addRfqSupplierTargets,
  awardRfq,
  createRfq,
  getRfqComparison,
  getRfqForViewer,
  issueRfq,
  listBuyerRfqs,
  listRfqInbox,
} from "./rfqs.service";

/**
 * Mounted at /api/organizations — buyer-side RFQ management, same
 * :organizationId scoping as requisitions. MANAGER+ for everything that
 * commits the organization to a supplier-facing action (create, issue,
 * invite more suppliers — Phase 7 §17: "MANAGER can submit/issue RFQs");
 * STAFF+ may read.
 */
export const organizationRfqsRouter = Router({ mergeParams: true });

organizationRfqsRouter.post(
  "/:organizationId/rfqs",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  validate(createRfqSchema),
  async (req, res, next) => {
    try {
      const result = await createRfq(req.params.organizationId, req.user!.id, req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

organizationRfqsRouter.get(
  "/:organizationId/rfqs",
  requireAuth,
  requireOrganizationMembership("STAFF"),
  validate(rfqListQuerySchema, "query"),
  async (req, res, next) => {
    try {
      res.status(200).json(await listBuyerRfqs(req.params.organizationId, req.query as never));
    } catch (err) {
      next(err);
    }
  }
);

organizationRfqsRouter.post(
  "/:organizationId/rfqs/:rfqId/issue",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  async (req, res, next) => {
    try {
      res.status(200).json(await issueRfq(req.params.organizationId, req.params.rfqId, req.user!.id));
    } catch (err) {
      next(err);
    }
  }
);

organizationRfqsRouter.post(
  "/:organizationId/rfqs/:rfqId/targets",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  validate(addRfqSupplierTargetsSchema),
  async (req, res, next) => {
    try {
      const result = await addRfqSupplierTargets(
        req.params.organizationId,
        req.params.rfqId,
        req.user!.id,
        req.body.supplierOrganizationIds
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Buyer-side comparison (Phase 8 §2) and award (Phase 8 §5) — same
 * router/scoping as the rest of this file. Comparison is a read (STAFF+);
 * award commits the organization to a decision (MANAGER+), same bar as
 * issuing or inviting.
 */
organizationRfqsRouter.get(
  "/:organizationId/rfqs/:rfqId/comparison",
  requireAuth,
  requireOrganizationMembership("STAFF"),
  async (req, res, next) => {
    try {
      res.status(200).json(await getRfqComparison(req.params.organizationId, req.params.rfqId));
    } catch (err) {
      next(err);
    }
  }
);

organizationRfqsRouter.post(
  "/:organizationId/rfqs/:rfqId/award",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  validate(awardRfqSchema),
  async (req, res, next) => {
    try {
      const result = await awardRfq(req.params.organizationId, req.params.rfqId, req.user!.id, req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Mounted at /api/organizations too — the supplier-side "RFQ inbox"
 * (Phase 7 §23), same org-scoping pattern as organizationOrdersRouter's
 * seller-side order list in Phase 6.
 */
export const organizationRfqInboxRouter = Router({ mergeParams: true });

organizationRfqInboxRouter.get(
  "/:organizationId/rfq-inbox",
  requireAuth,
  requireOrganizationMembership("STAFF"),
  validate(rfqListQuerySchema, "query"),
  async (req, res, next) => {
    try {
      res.status(200).json(await listRfqInbox(req.params.organizationId, req.query as never));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Mounted at /api/rfqs — a single detail route shared by buyer and
 * supplier viewers alike (mirrors orders.routes.ts's GET /orders/:orderId),
 * since which organization's perspective applies depends on the RFQ
 * itself, not a URL param.
 */
export const rfqDetailRouter = Router();

rfqDetailRouter.get("/:rfqId", requireAuth, async (req, res, next) => {
  try {
    res.status(200).json(await getRfqForViewer(req.params.rfqId, req.user!.id));
  } catch (err) {
    next(err);
  }
});
