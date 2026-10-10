import { Router } from "express";
import { createSupplierResponseSchema, updateSupplierResponseDraftSchema } from "@market-hub/shared";
import { requireAuth } from "../../middleware/auth";
import { requireOrganizationMembership } from "../../middleware/organizationAuth";
import { validate } from "../../middleware/validate";
import {
  createSupplierResponse,
  submitSupplierResponse,
  updateSupplierResponseDraft,
  withdrawSupplierResponse,
} from "./supplierResponses.service";

/**
 * Mounted at /api/organizations — a supplier's response to one RFQ,
 * scoped to :organizationId so the server always knows WHICH of the
 * caller's organizations they are responding as (Phase 7 §17: "supplier
 * STAFF can prepare responses" / "supplier MANAGER can submit responses").
 */
export const organizationSupplierResponsesRouter = Router({ mergeParams: true });

organizationSupplierResponsesRouter.post(
  "/:organizationId/rfqs/:rfqId/response",
  requireAuth,
  requireOrganizationMembership("STAFF"),
  validate(createSupplierResponseSchema),
  async (req, res, next) => {
    try {
      const result = await createSupplierResponse(req.params.organizationId, req.params.rfqId, req.user!.id, req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

organizationSupplierResponsesRouter.patch(
  "/:organizationId/rfqs/:rfqId/response",
  requireAuth,
  requireOrganizationMembership("STAFF"),
  validate(updateSupplierResponseDraftSchema),
  async (req, res, next) => {
    try {
      const result = await updateSupplierResponseDraft(req.params.organizationId, req.params.rfqId, req.user!.id, req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

organizationSupplierResponsesRouter.post(
  "/:organizationId/rfqs/:rfqId/response/submit",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  async (req, res, next) => {
    try {
      res.status(200).json(await submitSupplierResponse(req.params.organizationId, req.params.rfqId, req.user!.id));
    } catch (err) {
      next(err);
    }
  }
);

organizationSupplierResponsesRouter.post(
  "/:organizationId/rfqs/:rfqId/response/withdraw",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  async (req, res, next) => {
    try {
      res.status(200).json(await withdrawSupplierResponse(req.params.organizationId, req.params.rfqId, req.user!.id));
    } catch (err) {
      next(err);
    }
  }
);
