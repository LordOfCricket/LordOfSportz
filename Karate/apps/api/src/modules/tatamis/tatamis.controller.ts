import type { Request, Response } from "express";
import type { CreateTatamiRequest, TransitionTatamiStatusRequest } from "@karate/validation";
import { asyncHandler } from "../../errors/asyncHandler";
import * as tatamisService from "./tatamis.service";

function respond(res: Response, req: Request, status: number, data: unknown) {
  res
    .status(status)
    .json({ success: true, data, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
}

export const createTatamiHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tournamentId } = req.params as unknown as { tournamentId: string };
  const { label } = req.body as CreateTatamiRequest;
  respond(res, req, 201, await tatamisService.createTatami(tournamentId, req.user!.id, label));
});

export const listTatamisHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tournamentId } = req.params as unknown as { tournamentId: string };
  respond(res, req, 200, await tatamisService.listTatamis(tournamentId));
});

export const transitionTatamiStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tatamiId } = req.params as unknown as { tatamiId: string };
  const { status } = req.body as TransitionTatamiStatusRequest;
  respond(res, req, 200, await tatamisService.transitionTatamiStatus(tatamiId, req.user!.id, status));
});

export const startBoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const { boutId } = req.params as unknown as { boutId: string };
  respond(res, req, 200, await tatamisService.startBout(boutId, req.user!.id));
});

export const completeBoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const { boutId } = req.params as unknown as { boutId: string };
  respond(res, req, 200, await tatamisService.completeBout(boutId, req.user!.id));
});
