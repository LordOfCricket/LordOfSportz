import type { Request, Response } from "express";
import type { GenerateScheduleRequest, RecordDelayRequest } from "@karate/validation";
import { asyncHandler } from "../../errors/asyncHandler";
import * as schedulingService from "./scheduling.service";

function respond(res: Response, req: Request, status: number, data: unknown) {
  res
    .status(status)
    .json({ success: true, data, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
}

export const generateScheduleHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tournamentId } = req.params as unknown as { tournamentId: string };
  const input = req.body as GenerateScheduleRequest;
  respond(
    res,
    req,
    201,
    await schedulingService.generateTournamentSchedule(tournamentId, req.user!.id, input),
  );
});

export const getScheduleHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tournamentId } = req.params as unknown as { tournamentId: string };
  respond(
    res,
    req,
    200,
    await schedulingService.getScheduleForTournament(tournamentId, req.user?.id ?? null),
  );
});

export const publishScheduleHandler = asyncHandler(async (req: Request, res: Response) => {
  const { scheduleId } = req.params as unknown as { scheduleId: string };
  respond(res, req, 200, await schedulingService.publishSchedule(scheduleId, req.user!.id));
});

export const recordDelayHandler = asyncHandler(async (req: Request, res: Response) => {
  const { scheduleId } = req.params as unknown as { scheduleId: string };
  const input = req.body as RecordDelayRequest;
  respond(res, req, 201, await schedulingService.recordScheduleDelay(scheduleId, req.user!.id, input));
});

export const getMyUpcomingBoutsHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await schedulingService.getMyUpcomingBouts(req.user!.id));
});

export const getMyStudentsUpcomingBoutsHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await schedulingService.getMyStudentsUpcomingBouts(req.user!.id));
});

export const getAcademyUpcomingBoutsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { academyId } = req.params as unknown as { academyId: string };
  respond(res, req, 200, await schedulingService.getAcademyUpcomingBouts(academyId));
});
