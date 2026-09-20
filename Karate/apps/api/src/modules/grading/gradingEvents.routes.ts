import { Router } from "express";
import {
  createGradingEventSchema,
  addGradingParticipantSchema,
  recordGradingResultSchema,
  transitionGradingEventStatusSchema,
  gradingEventIdParamsSchema,
  participantIdParamsSchema,
  academyIdParamsSchema,
} from "@karate/validation";
import { authenticate } from "../../middleware/auth";
import { requireAcademyAdministrator } from "../../middleware/rbac";
import { validate } from "../../middleware/validate";
import {
  createGradingEventHandler,
  listGradingEventsHandler,
  getGradingEventHandler,
  addParticipantHandler,
  recordResultHandler,
  transitionStatusHandler,
} from "./gradingEvents.controller";

/** Mounted twice: nested under /academies/:academyId/grading-events (admin actions) and standalone for reads. */
export const academyGradingEventsRouter = Router({ mergeParams: true });

academyGradingEventsRouter.post(
  "/",
  authenticate,
  validate(academyIdParamsSchema, "params"),
  requireAcademyAdministrator(),
  validate(createGradingEventSchema),
  createGradingEventHandler,
);

academyGradingEventsRouter.get(
  "/",
  authenticate,
  validate(academyIdParamsSchema, "params"),
  requireAcademyAdministrator(),
  listGradingEventsHandler,
);

academyGradingEventsRouter.post(
  "/:eventId/status",
  authenticate,
  validate(gradingEventIdParamsSchema, "params"),
  requireAcademyAdministrator(),
  validate(transitionGradingEventStatusSchema),
  transitionStatusHandler,
);

academyGradingEventsRouter.post(
  "/:eventId/participants",
  authenticate,
  validate(gradingEventIdParamsSchema, "params"),
  requireAcademyAdministrator(),
  validate(addGradingParticipantSchema),
  addParticipantHandler,
);

academyGradingEventsRouter.post(
  "/:eventId/participants/:participantId/result",
  authenticate,
  validate(participantIdParamsSchema, "params"),
  requireAcademyAdministrator(),
  validate(recordGradingResultSchema),
  recordResultHandler,
);

/** Standalone read — any authenticated user may view a grading event's basic info and results. */
export const gradingEventsRouter = Router();
gradingEventsRouter.get("/:eventId", authenticate, getGradingEventHandler);
