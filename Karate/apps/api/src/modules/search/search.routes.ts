import { Router } from "express";
import { optionalAuthenticate } from "../../middleware/auth";
import { asyncHandler } from "../../errors/asyncHandler";
import { prisma } from "@karate/database";

export const searchRouter = Router();
searchRouter.get("/", optionalAuthenticate, asyncHandler(async (req, res) => {
  const query = typeof req.query["q"] === "string" ? req.query["q"].trim() : "";
  if (query.length < 2) { res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "q must contain at least 2 characters" } }); return; }
  const [players, coaches, academies, tournaments] = await Promise.all([
    prisma.playerProfile.findMany({ where: { status: "ACTIVE", displayName: { contains: query, mode: "insensitive" } }, select: { id: true, displayName: true }, take: 10 }),
    prisma.coachProfile.findMany({ where: { status: "ACTIVE", displayName: { contains: query, mode: "insensitive" } }, select: { id: true, displayName: true }, take: 10 }),
    prisma.academy.findMany({ where: { status: "ACTIVE", name: { contains: query, mode: "insensitive" } }, select: { id: true, name: true, slug: true }, take: 10 }),
    prisma.tournament.findMany({ where: { status: { not: "DRAFT" }, name: { contains: query, mode: "insensitive" } }, select: { id: true, name: true, slug: true, status: true }, take: 10 }),
  ]);
  res.json({ success: true, data: { players, coaches, academies, tournaments }, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
}));
