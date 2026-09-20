import type { Request, Response } from "express";
import type {
  AnnounceKataRequest,
  SubmitJudgeEvaluationRequest,
  CorrectJudgeEvaluationRequest,
  FinalizeKataResultRequest,
  CreateKataTeamRequest,
  KataTeamMemberRequest,
  CreateTeamBoutRequest,
} from "@karate/validation";
import { asyncHandler } from "../../errors/asyncHandler";
import * as kataService from "./kata.service";

function respond(res: Response, req: Request, status: number, data: unknown) {
  res
    .status(status)
    .json({ success: true, data, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
}

function boutId(req: Request): string {
  return (req.params as unknown as { boutId: string }).boutId;
}

export const listKataDefinitionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { ruleSetVersionId } = req.query as { ruleSetVersionId?: string };
  if (!ruleSetVersionId) {
    respond(res, req, 200, []);
    return;
  }
  respond(res, req, 200, await kataService.listKataDefinitions(ruleSetVersionId));
});

/** Idempotent, additive-only reference-data population — see kata.service.ts seedOfficialKataList for the authorization/provenance rationale. */
export const seedOfficialKataListHandler = asyncHandler(async (req: Request, res: Response) => {
  const { ruleSetVersionId } = req.body as { ruleSetVersionId: string };
  respond(res, req, 200, await kataService.seedOfficialKataList(ruleSetVersionId));
});

export const getKataStateHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await kataService.getKataState(boutId(req), req.user?.id ?? null));
});

export const announceKataHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as AnnounceKataRequest;
  respond(res, req, 200, await kataService.announceKata(boutId(req), req.user!.id, input));
});

export const submitJudgeEvaluationHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as SubmitJudgeEvaluationRequest;
  respond(res, req, 200, await kataService.submitJudgeEvaluation(boutId(req), req.user!.id, input));
});

export const correctJudgeEvaluationHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as CorrectJudgeEvaluationRequest;
  respond(res, req, 200, await kataService.correctJudgeEvaluation(boutId(req), req.user!.id, input));
});

export const finalizeKataResultHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as FinalizeKataResultRequest;
  respond(res, req, 200, await kataService.finalizeKataResult(boutId(req), req.user!.id, input));
});

export const getRoundRobinStandingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { drawId } = req.params as unknown as { drawId: string };
  respond(res, req, 200, await kataService.getRoundRobinStandings(drawId));
});

export const createKataTeamHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as CreateKataTeamRequest;
  respond(res, req, 201, await kataService.createKataTeam(req.user!.id, input));
});

export const listKataTeamsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { competitionId } = req.query as { competitionId?: string };
  respond(res, req, 200, competitionId ? await kataService.listKataTeams(competitionId) : []);
});

export const addKataTeamMemberHandler = asyncHandler(async (req: Request, res: Response) => {
  const { teamId } = req.params as unknown as { teamId: string };
  const { playerId } = req.body as KataTeamMemberRequest;
  respond(res, req, 201, await kataService.addKataTeamMember(req.user!.id, teamId, playerId));
});

export const removeKataTeamMemberHandler = asyncHandler(async (req: Request, res: Response) => {
  const { teamId } = req.params as unknown as { teamId: string };
  const { playerId } = req.body as KataTeamMemberRequest;
  respond(res, req, 200, await kataService.removeKataTeamMember(req.user!.id, teamId, playerId));
});

export const createTeamBoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const { competitionId } = req.params as unknown as { competitionId: string };
  const input = req.body as CreateTeamBoutRequest;
  respond(res, req, 201, await kataService.createTeamBout(req.user!.id, { competitionId, ...input }));
});
