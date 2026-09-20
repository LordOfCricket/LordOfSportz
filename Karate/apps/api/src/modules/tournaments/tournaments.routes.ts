import { Router } from "express";
import {
  listTournamentsQuerySchema,
  tournamentIdParamsSchema,
  transitionTournamentStatusSchema,
} from "@karate/validation";
import { authenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { validate } from "../../middleware/validate";
import { listTournamentsHandler, getTournamentDetailHandler, transitionStatusHandler } from "./tournaments.controller";

export const tournamentsRouter = Router();

tournamentsRouter.get("/", validate(listTournamentsQuerySchema, "query"), listTournamentsHandler);

tournamentsRouter.get(
  "/:tournamentId",
  validate(tournamentIdParamsSchema, "params"),
  getTournamentDetailHandler,
);

tournamentsRouter.patch(
  "/:tournamentId/status",
  authenticate,
  requireRole("ACADEMY"),
  validate(tournamentIdParamsSchema, "params"),
  validate(transitionTournamentStatusSchema),
  transitionStatusHandler,
);
