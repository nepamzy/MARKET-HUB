import { Router } from "express";
import { updateOrganizationProfileSchema } from "@market-hub/shared";
import { requireAuth } from "../../middleware/auth";
import { requireOrganizationMembership } from "../../middleware/organizationAuth";
import { validate } from "../../middleware/validate";
import { getOnboardingStatus, submitKyc, updateOrganizationProfile } from "./kyc.service";

/** Mounted at /api/organizations — same org-isolation boundary as every
 * other organization-scoped router (membership loaded server-side by
 * requireOrganizationMembership, never trusted from the client). */
export const organizationOnboardingRouter = Router({ mergeParams: true });

// Read access: any active member — status/KYC state is not sensitive
// business data, unlike the profile fields' write path below.
organizationOnboardingRouter.get(
  "/:organizationId/onboarding",
  requireAuth,
  requireOrganizationMembership("STAFF"),
  async (req, res, next) => {
    try {
      res.status(200).json(await getOnboardingStatus(req.params.organizationId));
    } catch (err) {
      next(err);
    }
  }
);

organizationOnboardingRouter.patch(
  "/:organizationId/profile",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  validate(updateOrganizationProfileSchema),
  async (req, res, next) => {
    try {
      const result = await updateOrganizationProfile(req.params.organizationId, req.user!.id, req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

organizationOnboardingRouter.post(
  "/:organizationId/kyc/submit",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  async (req, res, next) => {
    try {
      const result = await submitKyc(req.params.organizationId, req.user!.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);
