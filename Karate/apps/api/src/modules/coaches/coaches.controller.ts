import type { Request, Response } from "express";
import { asyncHandler } from "../../errors/asyncHandler";
import * as coachesService from "./coaches.service";

function respond(res: Response, req: Request, status: number, data: unknown) {
  res
    .status(status)
    .json({ success: true, data, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
}

export const createCoachProfileHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 201, await coachesService.createProfile(req.user!.id, req.body));
});

export const getMyCoachProfileHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await coachesService.getMyProfile(req.user!.id));
});

export const updateCoachProfileHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await coachesService.updateProfile(req.user!.id, req.body));
});

export const listMyAffiliationsHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await coachesService.listMyAffiliations(req.user!.id));
});

export const listMyPendingRequestsHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await coachesService.listMyPendingRequests(req.user!.id));
});

export const listMyStudentsGradesHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await coachesService.listMyStudentsGrades(req.user!.id));
});
