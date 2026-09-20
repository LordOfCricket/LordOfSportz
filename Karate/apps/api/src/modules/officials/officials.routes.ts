import { Router } from "express";
import {
  tournamentIdParamsSchema,
  assignOfficialSchema,
  assignmentIdParamsSchema,
  transitionAssignmentStatusSchema,
} from "@karate/validation";
import { authenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { validate } from "../../middleware/validate";
import {
  assignOfficialHandler,
  listTournamentAssignmentsHandler,
  transitionAssignmentStatusHandler,
  listMyAssignmentsHandler,
  getAssignmentHandler,
} from "./officials.controller";

/** Mounted at /api/v1/tournaments/:tournamentId/officials in app.ts. Organizer-only — a scorer can never reach this route to self-assign. */
export const tournamentOfficialsRouter = Router({ mergeParams: true });

tournamentOfficialsRouter.post(
  "/",
  authenticate,
  requireRole("ACADEMY"),
  validate(tournamentIdParamsSchema, "params"),
  validate(assignOfficialSchema),
  assignOfficialHandler,
);

tournamentOfficialsRouter.get(
  "/",
  authenticate,
  requireRole("ACADEMY"),
  validate(tournamentIdParamsSchema, "params"),
  listTournamentAssignmentsHandler,
);

/** Mounted at /api/v1/official-assignments in app.ts. */
export const officialAssignmentsRouter = Router();

officialAssignmentsRouter.post(
  "/:assignmentId/status",
  authenticate,
  requireRole("ACADEMY"),
  validate(assignmentIdParamsSchema, "params"),
  validate(transitionAssignmentStatusSchema),
  transitionAssignmentStatusHandler,
);

officialAssignmentsRouter.get(
  "/:assignmentId",
  authenticate,
  requireRole("SCORER"),
  validate(assignmentIdParamsSchema, "params"),
  getAssignmentHandler,
);

/** Mounted at /api/v1/scorers/me/assignments in app.ts. */
export const scorerAssignmentsRouter = Router();
scorerAssignmentsRouter.get("/", authenticate, requireRole("SCORER"), listMyAssignmentsHandler);
