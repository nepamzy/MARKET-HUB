import { Router } from "express";
import { directorySearchQuerySchema, updateSupplierProfileSchema } from "@market-hub/shared";
import { requireAuth } from "../../middleware/auth";
import { requireOrganizationMembership } from "../../middleware/organizationAuth";
import { validate } from "../../middleware/validate";
import { getDirectoryDetail, getSupplierProfile, searchDirectory, upsertSupplierProfile } from "./supplier.service";

/** Mounted at /api/organizations — same org-isolation boundary as every
 * other organization-scoped router. Read allowed for any active member;
 * write requires MANAGER+, matching the spec's "staff must not gain
 * owner/manager powers." */
export const organizationSupplierRouter = Router({ mergeParams: true });

organizationSupplierRouter.get(
  "/:organizationId/supplier-profile",
  requireAuth,
  requireOrganizationMembership("STAFF"),
  async (req, res, next) => {
    try {
      res.status(200).json(await getSupplierProfile(req.params.organizationId));
    } catch (err) {
      next(err);
    }
  }
);

organizationSupplierRouter.put(
  "/:organizationId/supplier-profile",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  validate(updateSupplierProfileSchema),
  async (req, res, next) => {
    try {
      const result = await upsertSupplierProfile(req.params.organizationId, req.user!.id, req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Mounted at /api/directory — requires authentication (any logged-in
 * platform user, not organization membership) but is not org-scoped, since
 * the whole point is discovering businesses the caller isn't a member of.
 * There is no unauthenticated public path here yet: with no B2C storefront
 * built (explicitly out of scope for this phase), requiring a session is
 * the more conservative default until a real public-facing surface exists
 * to justify opening it further — noted as a decision, not an oversight.
 */
export const directoryRouter = Router();

directoryRouter.get("/", requireAuth, validate(directorySearchQuerySchema, "query"), async (req, res, next) => {
  try {
    res.status(200).json(await searchDirectory(req.query as never));
  } catch (err) {
    next(err);
  }
});

directoryRouter.get("/:organizationId", requireAuth, async (req, res, next) => {
  try {
    res.status(200).json(await getDirectoryDetail(req.params.organizationId));
  } catch (err) {
    next(err);
  }
});
