import { Router } from "express";
import { prisma } from "../../lib/prisma";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

healthRouter.get("/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ready", database: "connected" });
  } catch {
    res.status(503).json({ status: "not_ready", database: "unreachable" });
  }
});
