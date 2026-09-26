import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { createInviteLinkSchema, reviewJoinRequestSchema } from "@market-hub/shared";
import { AppError } from "../../lib/errors";
import { requireAuth } from "../../middleware/auth";
import { requireOrganizationMembership } from "../../middleware/organizationAuth";
import { validate } from "../../middleware/validate";
import {
  acceptOrRequestInvite,
  createInviteLink,
  listInviteLinks,
  listJoinRequests,
  resolveInviteToken,
  revokeInviteLink,
  reviewJoinRequest,
} from "./invitations.service";

const directInviteSchema = createInviteLinkSchema.extend({
  inviteeEmail: z.string().email().optional(),
  role: z.enum(["MANAGER", "STAFF"]).optional(), // never OWNER — same boundary as addMemberSchema
});

/**
 * Mounted at /api/organizations — reuses requireOrganizationMembership
 * exactly like the existing member-management routes, so the org-isolation
 * boundary is identical: a caller must be OWNER/MANAGER of *this specific*
 * organizationId, loaded from the database, never from anything the client
 * asserts.
 */
export const organizationInvitationsRouter = Router({ mergeParams: true });

organizationInvitationsRouter.post(
  "/:organizationId/invite-links",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  validate(directInviteSchema),
  async (req, res, next) => {
    try {
      const result = await createInviteLink(req.params.organizationId, req.user!.id, req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

organizationInvitationsRouter.get(
  "/:organizationId/invite-links",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  async (req, res, next) => {
    try {
      res.status(200).json(await listInviteLinks(req.params.organizationId));
    } catch (err) {
      next(err);
    }
  }
);

organizationInvitationsRouter.delete(
  "/:organizationId/invite-links/:linkId",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  async (req, res, next) => {
    try {
      await revokeInviteLink(req.params.organizationId, req.params.linkId, req.user!.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

organizationInvitationsRouter.get(
  "/:organizationId/join-requests",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  async (req, res, next) => {
    try {
      const status = req.query.status;
      if (status !== undefined && status !== "PENDING" && status !== "APPROVED" && status !== "REJECTED") {
        throw AppError.badRequest("Invalid status filter");
      }
      res.status(200).json(await listJoinRequests(req.params.organizationId, status));
    } catch (err) {
      next(err);
    }
  }
);

organizationInvitationsRouter.patch(
  "/:organizationId/join-requests/:requestId",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  validate(reviewJoinRequestSchema),
  async (req, res, next) => {
    try {
      const result = await reviewJoinRequest(
        req.params.organizationId,
        req.params.requestId,
        req.user!.id,
        req.body.status
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Mounted at /api/invites — deliberately separate from the org-scoped
 * router above. GET is public and unauthenticated by design (Rule 7 of the
 * Phase 1 spec: resolving a token must not require already having access).
 * POST requires authentication but does NOT require organization
 * membership, since the whole point is the caller isn't a member yet.
 */
export const publicInvitesRouter = Router();

// Same rate-limiting discipline as auth.routes.ts's authLimiter — accepting
// an invite is, like login/register, an unauthenticated-adjacent action
// worth guarding against brute-forcing token guesses (tokens are
// high-entropy, so this is defense in depth, not the primary protection).
const acceptInviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Too many attempts, try again later" } },
});

publicInvitesRouter.get("/:token", async (req, res, next) => {
  try {
    res.status(200).json(await resolveInviteToken(req.params.token));
  } catch (err) {
    next(err);
  }
});

publicInvitesRouter.post("/:token/accept", acceptInviteLimiter, requireAuth, async (req, res, next) => {
  try {
    res.status(200).json(await acceptOrRequestInvite(req.params.token, req.user!.id));
  } catch (err) {
    next(err);
  }
});
