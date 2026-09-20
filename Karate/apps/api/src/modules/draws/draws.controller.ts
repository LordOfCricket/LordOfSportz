import type { Request, Response } from "express";
import type { GenerateDrawRequest } from "@karate/validation";
import { asyncHandler } from "../../errors/asyncHandler";
import * as drawsService from "./draws.service";

function respond(res: Response, req: Request, status: number, data: unknown) {
  res
    .status(status)
    .json({ success: true, data, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
}

export const generateDrawHandler = asyncHandler(async (req: Request, res: Response) => {
  const { competitionId } = req.params as unknown as { competitionId: string };
  const input = req.body as GenerateDrawRequest;
  respond(res, req, 201, await drawsService.generateDraw(competitionId, req.user!.id, input));
});

export const getDrawHandler = asyncHandler(async (req: Request, res: Response) => {
  const { competitionId } = req.params as unknown as { competitionId: string };
  respond(res, req, 200, await drawsService.getDrawForCompetition(competitionId, req.user?.id ?? null));
});

export const publishDrawHandler = asyncHandler(async (req: Request, res: Response) => {
  const { drawId } = req.params as unknown as { drawId: string };
  respond(res, req, 200, await drawsService.publishDraw(drawId, req.user!.id));
});

export const lockDrawHandler = asyncHandler(async (req: Request, res: Response) => {
  const { drawId } = req.params as unknown as { drawId: string };
  respond(res, req, 200, await drawsService.lockDraw(drawId, req.user!.id));
});
