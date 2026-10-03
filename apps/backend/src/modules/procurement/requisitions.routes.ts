import { Router } from "express";
import {
  cancelRequisitionSchema,
  createRequisitionSchema,
  requisitionListQuerySchema,
  updateRequisitionDraftSchema,
} from "@market-hub/shared";
import { requireAuth } from "../../middleware/auth";
import { requireOrganizationMembership } from "../../middleware/organizationAuth";
import { validate } from "../../middleware/validate";
import {
  cancelRequisition,
  createRequisition,
  getRequisition,
  listRequisitions,
  submitRequisition,
  updateRequisitionDraft,
} from "./requisitions.service";

/**
 * Mounted at /api/organizations — a requisition is purely buyer-side
 * internal procurement, so every route here is scoped to exactly one
 * :organizationId, same pattern as organizationProductsRouter. STAFF may
 * read, create, and edit drafts (Phase 7 §17: "STAFF can create drafts");
 * MANAGER+ is required to submit or cancel, the same bar as issuing an RFQ.
 */
export const organizationRequisitionsRouter = Router({ mergeParams: true });

organizationRequisitionsRouter.post(
  "/:organizationId/requisitions",
  requireAuth,
  requireOrganizationMembership("STAFF"),
  validate(createRequisitionSchema),
  async (req, res, next) => {
    try {
      const result = await createRequisition(req.params.organizationId, req.user!.id, req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

organizationRequisitionsRouter.get(
  "/:organizationId/requisitions",
  requireAuth,
  requireOrganizationMembership("STAFF"),
  validate(requisitionListQuerySchema, "query"),
  async (req, res, next) => {
    try {
      res.status(200).json(await listRequisitions(req.params.organizationId, req.query as never));
    } catch (err) {
      next(err);
    }
  }
);

organizationRequisitionsRouter.get(
  "/:organizationId/requisitions/:requisitionId",
  requireAuth,
  requireOrganizationMembership("STAFF"),
  async (req, res, next) => {
    try {
      res.status(200).json(await getRequisition(req.params.organizationId, req.params.requisitionId));
    } catch (err) {
      next(err);
    }
  }
);

organizationRequisitionsRouter.patch(
  "/:organizationId/requisitions/:requisitionId",
  requireAuth,
  requireOrganizationMembership("STAFF"),
  validate(updateRequisitionDraftSchema),
  async (req, res, next) => {
    try {
      const result = await updateRequisitionDraft(
        req.params.organizationId,
        req.params.requisitionId,
        req.user!.id,
        req.body
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

organizationRequisitionsRouter.post(
  "/:organizationId/requisitions/:requisitionId/submit",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  async (req, res, next) => {
    try {
      res.status(200).json(await submitRequisition(req.params.organizationId, req.params.requisitionId, req.user!.id));
    } catch (err) {
      next(err);
    }
  }
);

organizationRequisitionsRouter.post(
  "/:organizationId/requisitions/:requisitionId/cancel",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  validate(cancelRequisitionSchema),
  async (req, res, next) => {
    try {
      const result = await cancelRequisition(
        req.params.organizationId,
        req.params.requisitionId,
        req.user!.id,
        req.body.reason
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);
