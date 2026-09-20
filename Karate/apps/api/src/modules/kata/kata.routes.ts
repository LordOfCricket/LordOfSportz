import { Router } from "express";
import {
  boutIdParamsSchema,
  drawIdParamsSchema,
  competitionIdParamsSchema,
  announceKataSchema,
  submitJudgeEvaluationSchema,
  correctJudgeEvaluationSchema,
  finalizeKataResultSchema,
  seedOfficialKataListSchema,
  createKataTeamSchema,
  teamIdParamsSchema,
  kataTeamMemberSchema,
  createTeamBoutSchema,
} from "@karate/validation";
import { authenticate, optionalAuthenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { validate } from "../../middleware/validate";
import {
  listKataDefinitionsHandler,
  seedOfficialKataListHandler,
  getKataStateHandler,
  announceKataHandler,
  submitJudgeEvaluationHandler,
  correctJudgeEvaluationHandler,
  finalizeKataResultHandler,
  getRoundRobinStandingsHandler,
  createKataTeamHandler,
  listKataTeamsHandler,
  addKataTeamMemberHandler,
  removeKataTeamMemberHandler,
  createTeamBoutHandler,
} from "./kata.controller";

/** Mounted at /api/v1/kata-definitions in app.ts. Reads are public; seeding is additive/idempotent and ACADEMY-gated (no per-ruleset ownership model exists yet — low risk since it only ever adds reference rows, never removes or edits existing ones). */
export const kataDefinitionsRouter = Router();
kataDefinitionsRouter.get("/", optionalAuthenticate, listKataDefinitionsHandler);
kataDefinitionsRouter.post(
  "/seed-official-list",
  authenticate,
  requireRole("ACADEMY"),
  validate(seedOfficialKataListSchema),
  seedOfficialKataListHandler,
);

/** Mounted at /api/v1/bouts/:boutId/kata in app.ts. Function-level authorization (JUDGE/TATAMI_MANAGER, tournament/tatami/competition scope) is enforced inside kata.service.ts. */
export const kataRouter = Router({ mergeParams: true });

kataRouter.get("/", authenticate, validate(boutIdParamsSchema, "params"), getKataStateHandler);

kataRouter.post(
  "/announce",
  authenticate,
  requireRole("ACADEMY"),
  validate(boutIdParamsSchema, "params"),
  validate(announceKataSchema),
  announceKataHandler,
);

kataRouter.post(
  "/evaluations",
  authenticate,
  requireRole("SCORER"),
  validate(boutIdParamsSchema, "params"),
  validate(submitJudgeEvaluationSchema),
  submitJudgeEvaluationHandler,
);

kataRouter.post(
  "/evaluations/correct",
  authenticate,
  requireRole("SCORER"),
  validate(boutIdParamsSchema, "params"),
  validate(correctJudgeEvaluationSchema),
  correctJudgeEvaluationHandler,
);

kataRouter.post(
  "/finalize",
  authenticate,
  requireRole("ACADEMY", "SCORER"),
  validate(boutIdParamsSchema, "params"),
  validate(finalizeKataResultSchema),
  finalizeKataResultHandler,
);

/** Mounted at /api/v1/draws/:drawId/kata-standings in app.ts — public, mirroring the existing public draw-read pattern. */
export const kataStandingsRouter = Router({ mergeParams: true });
kataStandingsRouter.get(
  "/",
  optionalAuthenticate,
  validate(drawIdParamsSchema, "params"),
  getRoundRobinStandingsHandler,
);

/** Mounted at /api/v1/kata-teams in app.ts. Reads are public; mutations are ACADEMY-administrator-gated inside kata.service.ts (assertActorAdministersAcademy). */
export const kataTeamsRouter = Router();
kataTeamsRouter.get("/", optionalAuthenticate, listKataTeamsHandler);
kataTeamsRouter.post("/", authenticate, requireRole("ACADEMY"), validate(createKataTeamSchema), createKataTeamHandler);
kataTeamsRouter.post(
  "/:teamId/members",
  authenticate,
  requireRole("ACADEMY"),
  validate(teamIdParamsSchema, "params"),
  validate(kataTeamMemberSchema),
  addKataTeamMemberHandler,
);
kataTeamsRouter.post(
  "/:teamId/members/remove",
  authenticate,
  requireRole("ACADEMY"),
  validate(teamIdParamsSchema, "params"),
  validate(kataTeamMemberSchema),
  removeKataTeamMemberHandler,
);

/** Mounted at /api/v1/competitions/:competitionId/kata/team-bouts in app.ts — organizer-only (kata.service.ts). */
export const kataTeamBoutsRouter = Router({ mergeParams: true });
kataTeamBoutsRouter.post(
  "/",
  authenticate,
  requireRole("ACADEMY"),
  validate(competitionIdParamsSchema, "params"),
  validate(createTeamBoutSchema),
  createTeamBoutHandler,
);
