import type { Request, Response } from "express";
import type { ApiSuccessResponse } from "@karate/types";
import type { ListTournamentsQuery } from "@karate/validation";
import { asyncHandler } from "../../errors/asyncHandler";
import * as tournamentsService from "./tournaments.service";

export const transitionStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tournamentId } = req.params as unknown as { tournamentId: string };
  const result = await tournamentsService.transitionTournamentStatus(tournamentId, req.user!.id, req.body);
  const body: ApiSuccessResponse<typeof result> = {
    success: true,
    data: result,
    meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
  };
  res.status(200).json(body);
});

export const listTournamentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await tournamentsService.listPublicTournaments(req.query as unknown as ListTournamentsQuery);
  const body: ApiSuccessResponse<typeof result> = {
    success: true,
    data: result,
    meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
  };
  res.status(200).json(body);
});

export const getTournamentDetailHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tournamentId } = req.params as unknown as { tournamentId: string };
  const result = await tournamentsService.getTournamentDetail(tournamentId);
  const body: ApiSuccessResponse<typeof result> = {
    success: true,
    data: result,
    meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
  };
  res.status(200).json(body);
});
