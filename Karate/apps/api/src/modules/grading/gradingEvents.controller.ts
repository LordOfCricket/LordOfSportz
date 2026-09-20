import type { Request, Response } from "express";
import { asyncHandler } from "../../errors/asyncHandler";
import * as service from "./gradingEvents.service";

function respond(res: Response, req: Request, status: number, data: unknown) {
  res
    .status(status)
    .json({ success: true, data, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
}

export const createGradingEventHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 201, await service.createGradingEvent(req.params["academyId"]!, req.body));
});

export const listGradingEventsHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await service.listGradingEvents(req.params["academyId"]!));
});

export const getGradingEventHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await service.getGradingEvent(req.params["eventId"]!));
});

export const addParticipantHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.addParticipant(req.params["academyId"]!, req.params["eventId"]!, req.body);
  respond(res, req, 201, result);
});

export const recordResultHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.recordResult(
    req.params["academyId"]!,
    req.params["eventId"]!,
    req.params["participantId"]!,
    req.user!.id,
    req.body,
  );
  respond(res, req, 200, result);
});

export const transitionStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.transitionStatus(
    req.params["academyId"]!,
    req.params["eventId"]!,
    req.user!.id,
    req.body.status,
  );
  respond(res, req, 200, result);
});
