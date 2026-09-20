import type { Request, Response } from "express";
import { asyncHandler } from "../../errors/asyncHandler";
import * as playersService from "./players.service";

function respond(res: Response, req: Request, status: number, data: unknown) {
  res
    .status(status)
    .json({ success: true, data, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
}

export const createPlayerProfileHandler = asyncHandler(async (req: Request, res: Response) => {
  const profile = await playersService.createProfile(req.user!.id, req.body);
  respond(res, req, 201, profile);
});

export const getMyPlayerProfileHandler = asyncHandler(async (req: Request, res: Response) => {
  const profile = await playersService.getMyProfile(req.user!.id);
  respond(res, req, 200, profile);
});

export const updatePlayerProfileHandler = asyncHandler(async (req: Request, res: Response) => {
  const profile = await playersService.updateProfile(req.user!.id, req.body);
  respond(res, req, 200, profile);
});

export const listMyMembershipsHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await playersService.listMyMemberships(req.user!.id));
});

export const listMyPendingRequestsHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await playersService.listMyPendingRequests(req.user!.id));
});

export const getMyBeltHistoryHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await playersService.getMyBeltHistory(req.user!.id));
});
