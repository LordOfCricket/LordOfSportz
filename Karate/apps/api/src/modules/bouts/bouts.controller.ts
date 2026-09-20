import type { Request, Response } from "express";
import type { RecordBoutResultRequest, CancelBoutRequest, PauseBoutRequest } from "@karate/validation";
import { asyncHandler } from "../../errors/asyncHandler";
import * as boutsService from "./bouts.service";

function respond(res: Response, req: Request, status: number, data: unknown) {
  res
    .status(status)
    .json({ success: true, data, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
}

function boutId(req: Request): string {
  return (req.params as unknown as { boutId: string }).boutId;
}

export const getBoutHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await boutsService.getBoutById(boutId(req), req.user?.id ?? null));
});

export const callBoutHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await boutsService.callBout(boutId(req), req.user!.id));
});

export const markBoutReadyHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await boutsService.markBoutReady(boutId(req), req.user!.id));
});

export const pauseBoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const { reason } = req.body as PauseBoutRequest;
  respond(res, req, 200, await boutsService.pauseBout(boutId(req), req.user!.id, reason));
});

export const resumeBoutHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await boutsService.resumeBout(boutId(req), req.user!.id));
});

export const recordBoutResultHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as RecordBoutResultRequest;
  respond(res, req, 200, await boutsService.recordBoutResult(boutId(req), req.user!.id, input));
});

export const finalizeBoutHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await boutsService.finalizeBout(boutId(req), req.user!.id));
});

export const correctBoutResultHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await boutsService.correctFinalizedBoutResult(boutId(req), req.user!.id, req.body));
});

export const sendBoutToReviewHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await boutsService.sendBoutToReview(boutId(req), req.user!.id));
});

export const cancelBoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const { reason } = req.body as CancelBoutRequest;
  respond(res, req, 200, await boutsService.cancelBout(boutId(req), req.user!.id, reason));
});

export const getMyBoutsHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await boutsService.getMyBouts(req.user!.id));
});

export const getMyStudentsBoutsHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await boutsService.getMyStudentsBouts(req.user!.id));
});

export const getAcademyBoutsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { academyId } = req.params as unknown as { academyId: string };
  respond(res, req, 200, await boutsService.getAcademyBouts(academyId));
});
