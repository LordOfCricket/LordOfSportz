import type { Request, Response } from "express";
import type {
  SubmitKumiteScoreRequest,
  CancelKumiteScoreRequest,
  ApplyKumitePenaltyRequest,
  SubmitHanteiVotesRequest,
  FinalizeKumiteResultRequest,
  RequestVideoReviewRequest,
  DecideVideoReviewRequest,
} from "@karate/validation";
import { asyncHandler } from "../../errors/asyncHandler";
import * as kumiteService from "./kumite.service";

function respond(res: Response, req: Request, status: number, data: unknown) {
  res
    .status(status)
    .json({ success: true, data, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
}

function boutId(req: Request): string {
  return (req.params as unknown as { boutId: string }).boutId;
}

export const getKumiteStateHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await kumiteService.getKumiteState(boutId(req), req.user?.id ?? null));
});

export const submitKumiteScoreHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as SubmitKumiteScoreRequest;
  respond(res, req, 200, await kumiteService.submitKumiteScore(boutId(req), req.user!.id, input));
});

export const cancelKumiteScoreHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as CancelKumiteScoreRequest;
  respond(res, req, 200, await kumiteService.cancelKumiteScore(boutId(req), req.user!.id, input));
});

export const applyKumitePenaltyHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as ApplyKumitePenaltyRequest;
  respond(res, req, 200, await kumiteService.applyKumitePenalty(boutId(req), req.user!.id, input));
});

export const submitHanteiVotesHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as SubmitHanteiVotesRequest;
  respond(res, req, 200, await kumiteService.submitHanteiVotes(boutId(req), req.user!.id, input));
});

export const finalizeKumiteResultHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as FinalizeKumiteResultRequest;
  respond(res, req, 200, await kumiteService.finalizeKumiteResult(boutId(req), req.user!.id, input));
});

export const startKumiteClockHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await kumiteService.startKumiteClock(boutId(req), req.user!.id));
});

export const pauseKumiteClockHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await kumiteService.pauseKumiteClock(boutId(req), req.user!.id));
});

export const resumeKumiteClockHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await kumiteService.resumeKumiteClock(boutId(req), req.user!.id));
});

export const requestVideoReviewHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as RequestVideoReviewRequest;
  respond(res, req, 201, await kumiteService.requestVideoReview(boutId(req), req.user!.id, input));
});

export const decideVideoReviewHandler = asyncHandler(async (req: Request, res: Response) => {
  const { requestId } = req.params as unknown as { requestId: string };
  const input = req.body as DecideVideoReviewRequest;
  respond(res, req, 200, await kumiteService.decideVideoReview(boutId(req), requestId, req.user!.id, input));
});
