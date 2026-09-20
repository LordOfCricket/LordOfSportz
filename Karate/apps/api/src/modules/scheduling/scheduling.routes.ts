import { Router } from "express";
import {
  tournamentIdParamsSchema,
  scheduleIdParamsSchema,
  generateScheduleSchema,
  recordDelaySchema,
  academyIdParamsSchema,
} from "@karate/validation";
import { authenticate, optionalAuthenticate } from "../../middleware/auth";
import { requireRole, requireAcademyAdministrator } from "../../middleware/rbac";
import { validate } from "../../middleware/validate";
import {
  generateScheduleHandler,
  getScheduleHandler,
  publishScheduleHandler,
  recordDelayHandler,
  getMyUpcomingBoutsHandler,
  getMyStudentsUpcomingBoutsHandler,
  getAcademyUpcomingBoutsHandler,
} from "./scheduling.controller";

/** Mounted at /api/v1/tournaments/:tournamentId/schedule in app.ts. */
export const tournamentScheduleRouter = Router({ mergeParams: true });

tournamentScheduleRouter.post(
  "/",
  authenticate,
  requireRole("ACADEMY"),
  validate(tournamentIdParamsSchema, "params"),
  validate(generateScheduleSchema),
  generateScheduleHandler,
);

tournamentScheduleRouter.get(
  "/",
  optionalAuthenticate,
  validate(tournamentIdParamsSchema, "params"),
  getScheduleHandler,
);

/** Mounted at /api/v1/schedules in app.ts. */
export const schedulesRouter = Router();

schedulesRouter.post(
  "/:scheduleId/publish",
  authenticate,
  requireRole("ACADEMY"),
  validate(scheduleIdParamsSchema, "params"),
  publishScheduleHandler,
);

schedulesRouter.post(
  "/:scheduleId/delay",
  authenticate,
  requireRole("ACADEMY"),
  validate(scheduleIdParamsSchema, "params"),
  validate(recordDelaySchema),
  recordDelayHandler,
);

/** Mounted at /api/v1/players/me/schedule in app.ts. */
export const playerScheduleRouter = Router();
playerScheduleRouter.get("/", authenticate, requireRole("PLAYER"), getMyUpcomingBoutsHandler);

/** Mounted at /api/v1/coaches/me/students-schedule in app.ts. */
export const coachStudentsScheduleRouter = Router();
coachStudentsScheduleRouter.get("/", authenticate, requireRole("COACH"), getMyStudentsUpcomingBoutsHandler);

/** Mounted at /api/v1/academies/:academyId/schedule in app.ts. */
export const academyScheduleRouter = Router({ mergeParams: true });
academyScheduleRouter.get(
  "/",
  authenticate,
  validate(academyIdParamsSchema, "params"),
  requireAcademyAdministrator(),
  getAcademyUpcomingBoutsHandler,
);
