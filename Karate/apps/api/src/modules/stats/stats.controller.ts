import type { Request, Response } from "express";
import { asyncHandler } from "../../errors/asyncHandler";
import * as service from "./stats.service";
import { NotFoundError } from "@karate/shared";

function respond(res: Response, req: Request, data: unknown) {
  res.json({ success: true, data, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
}

export const playerResultsHandler = asyncHandler(async (req: Request, res: Response) => {
  const profile = await servicePlayer(req.user!.id);
  respond(res, req, await service.getPlayerResults(profile.id));
});

export const playerStatsHandler = asyncHandler(async (req: Request, res: Response) => {
  const profile = await servicePlayer(req.user!.id);
  respond(res, req, await service.getPlayerStats(profile.id, typeof req.query["seasonId"] === "string" ? req.query["seasonId"] : undefined));
});

export const coachStatsHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, await service.getCoachStats(req.user!.id));
});

export const coachResultsHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, await service.getCoachResults(req.user!.id));
});

export const tournamentResultsHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, await service.getTournamentResults(req.params["tournamentId"]!));
});

export const tournamentStatsHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, await service.getTournamentStats(req.params["tournamentId"]!));
});

export const academyStatsHandler = asyncHandler(async (req: Request, res: Response) => {
  await service.assertAcademyAccess(req.params["academyId"]!, req.user!.id);
  respond(res, req, await service.getAcademyStats(req.params["academyId"]!));
});

async function servicePlayer(userId: string) {
  const { prisma } = await import("@karate/database");
  const profile = await prisma.playerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) throw new NotFoundError("Player profile");
  return profile;
}
