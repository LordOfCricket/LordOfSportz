import { Router } from "express";
import { prisma } from "@karate/database";
import { asyncHandler } from "../../errors/asyncHandler";

export const healthRouter = Router();

healthRouter.get("/live", (_req, res) => {
  res.status(200).json({ success: true, data: { status: "live" } });
});

healthRouter.get(
  "/ready",
  asyncHandler(async (_req, res) => {
    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error("database readiness timeout")), 2_000)),
      ]);
      res.status(200).json({ success: true, data: { status: "ready" } });
    } catch {
      res.status(503).json({ success: false, error: { code: "NOT_READY", message: "Service is not ready." } });
    }
  }),
);
