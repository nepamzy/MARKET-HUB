import { Router } from "express";
import { z } from "zod";
import {
  addMemberSchema,
  createOrganizationSchema,
  transferOwnershipSchema,
  updateMemberRoleSchema,
} from "@market-hub/shared";
import { AppError } from "../../lib/errors";
import { requireAuth } from "../../middleware/auth";
import { requireOrganizationMembership } from "../../middleware/organizationAuth";
import { validate } from "../../middleware/validate";
import {
  addMember,
  createOrganization,
  getOrganization,
  listMembers,
  removeMember,
  transferOwnership,
  updateMemberRole,
  updateOrganizationName,
} from "./organizations.service";

export const organizationsRouter = Router();

const updateOrgSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
});

organizationsRouter.post("/", requireAuth, validate(createOrganizationSchema), async (req, res, next) => {
  try {
    const organization = await createOrganization(req.user!.id, req.body);
    res.status(201).json({ organization });
  } catch (err) {
    next(err);
  }
});

organizationsRouter.get(
  "/:organizationId",
  requireAuth,
  requireOrganizationMembership("STAFF"),
  async (req, res, next) => {
    try {
      const organization = await getOrganization(req.params.organizationId);
      res.status(200).json({ organization, membershipRole: req.membership!.role });
    } catch (err) {
      next(err);
    }
  }
);

organizationsRouter.patch(
  "/:organizationId",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  validate(updateOrgSchema),
  async (req, res, next) => {
    try {
      const organization = await updateOrganizationName(
        req.params.organizationId,
        req.body.legalName,
        req.user!.id
      );
      res.status(200).json({ organization });
    } catch (err) {
      next(err);
    }
  }
);

organizationsRouter.get(
  "/:organizationId/members",
  requireAuth,
  requireOrganizationMembership("STAFF"),
  async (req, res, next) => {
    try {
      const members = await listMembers(req.params.organizationId);
      res.status(200).json({ members });
    } catch (err) {
      next(err);
    }
  }
);

organizationsRouter.post(
  "/:organizationId/members",
  requireAuth,
  requireOrganizationMembership("MANAGER"),
  validate(addMemberSchema),
  async (req, res, next) => {
    try {
      const membership = await addMember(
        req.params.organizationId,
        req.body.email,
        req.body.role,
        req.user!.id
      );
      res.status(201).json({ membership });
    } catch (err) {
      next(err);
    }
  }
);

organizationsRouter.patch(
  "/:organizationId/members/:userId",
  requireAuth,
  requireOrganizationMembership("OWNER"),
  validate(updateMemberRoleSchema),
  async (req, res, next) => {
    try {
      if (req.body.role === "OWNER") {
        throw AppError.badRequest("Use the ownership transfer endpoint to grant OWNER");
      }
      const membership = await updateMemberRole(
        req.params.organizationId,
        req.params.userId,
        req.body.role,
        req.user!.id
      );
      res.status(200).json({ membership });
    } catch (err) {
      next(err);
    }
  }
);

organizationsRouter.delete(
  "/:organizationId/members/:userId",
  requireAuth,
  requireOrganizationMembership("OWNER"),
  async (req, res, next) => {
    try {
      await removeMember(req.params.organizationId, req.params.userId, req.user!.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

organizationsRouter.post(
  "/:organizationId/transfer-ownership",
  requireAuth,
  requireOrganizationMembership("OWNER"),
  validate(transferOwnershipSchema),
  async (req, res, next) => {
    try {
      await transferOwnership(req.params.organizationId, req.user!.id, req.body.newOwnerUserId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);
