import { Router } from "express";
import { AppError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { PUBLIC_USER_SELECT } from "../auth/auth.service";

export const usersRouter = Router();

usersRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) {
      throw AppError.notFound("User not found");
    }
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
});

usersRouter.get("/me/organizations", requireAuth, async (req, res, next) => {
  try {
    const memberships = await prisma.organizationMembership.findMany({
      where: { userId: req.user!.id },
      select: {
        role: true,
        organization: {
          select: {
            id: true,
            legalName: true,
            businessType: true,
            status: true,
            verificationStatus: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    res.status(200).json({
      organizations: memberships.map((m) => ({ ...m.organization, membershipRole: m.role })),
    });
  } catch (err) {
    next(err);
  }
});
