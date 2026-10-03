import { Router } from "express";
import { createNegotiationSchema, respondToNegotiationSchema } from "@market-hub/shared";
import { requireAuth } from "../../middleware/auth";
import { requireOrganizationMembership } from "../../middleware/organizationAuth";
import { validate } from "../../middleware/validate";
import { createNegotiation, getNegotiationForViewer, respondToNegotiation } from "./negotiations.service";

/**
 * Mounted at /api/organizations — opening a negotiation is always a
 * buyer-side action against one of the buyer's own RFQs (Phase 8 §3),
 * MANAGER+ (Phase 8 §7: "MANAGER+ may initiate buyer-side procurement
 * actions such as negotiation and award").
 */
export const organizationNegotiationsRouter = Router({ mergeParams: true });

organizationNegotiationsRouter.post(
  "/:organizationId/rfqs/:rfqId/negotiations",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  validate(createNegotiationSchema),
  async (req, res, next) => {
    try {
      const result = await createNegotiation(req.params.organizationId, req.params.rfqId, req.user!.id, req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Mounted at /api/negotiations — a single detail + respond pair shared by
 * both sides (mirrors orders.routes.ts's GET /orders/:orderId and
 * rfqs.routes.ts's GET /rfqs/:rfqId), since which organization's
 * perspective applies depends on the negotiation itself, not a URL param.
 */
export const negotiationDetailRouter = Router();

negotiationDetailRouter.get("/:negotiationId", requireAuth, async (req, res, next) => {
  try {
    res.status(200).json(await getNegotiationForViewer(req.params.negotiationId, req.user!.id));
  } catch (err) {
    next(err);
  }
});

negotiationDetailRouter.post(
  "/:negotiationId/respond",
  requireAuth,
  validate(respondToNegotiationSchema),
  async (req, res, next) => {
    try {
      res.status(200).json(await respondToNegotiation(req.params.negotiationId, req.user!.id, req.body));
    } catch (err) {
      next(err);
    }
  }
);
