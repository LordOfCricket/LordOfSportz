import type { Request, Response } from "express";
import { asyncHandler } from "../../errors/asyncHandler";
import * as scorersService from "./scorers.service";

function respond(res: Response, req: Request, status: number, data: unknown) {
  res
    .status(status)
    .json({ success: true, data, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
}

export const createScorerProfileHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 201, await scorersService.createProfile(req.user!.id, req.body));
});

export const getMyScorerProfileHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await scorersService.getMyProfile(req.user!.id));
});

export const updateScorerProfileHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await scorersService.updateProfile(req.user!.id, req.body));
});
