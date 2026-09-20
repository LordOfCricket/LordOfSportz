import type { Request, Response } from "express";
import type { AssignOfficialRequest, TransitionAssignmentStatusRequest } from "@karate/validation";
import { asyncHandler } from "../../errors/asyncHandler";
import * as officialsService from "./officials.service";

function respond(res: Response, req: Request, status: number, data: unknown) {
  res
    .status(status)
    .json({ success: true, data, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
}

export const assignOfficialHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tournamentId } = req.params as unknown as { tournamentId: string };
  const { force, ...input } = req.body as AssignOfficialRequest;
  respond(res, req, 201, await officialsService.assignOfficial(tournamentId, req.user!.id, input, force));
});

export const listTournamentAssignmentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tournamentId } = req.params as unknown as { tournamentId: string };
  respond(res, req, 200, await officialsService.listTournamentAssignments(tournamentId, req.user!.id));
});

export const transitionAssignmentStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const { assignmentId } = req.params as unknown as { assignmentId: string };
  const { status } = req.body as TransitionAssignmentStatusRequest;
  respond(
    res,
    req,
    200,
    await officialsService.transitionAssignmentStatus(assignmentId, req.user!.id, status),
  );
});

export const listMyAssignmentsHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await officialsService.listMyAssignments(req.user!.id));
});

export const getAssignmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const { assignmentId } = req.params as unknown as { assignmentId: string };
  respond(res, req, 200, await officialsService.getAssignmentForScorer(assignmentId, req.user!.id));
});
