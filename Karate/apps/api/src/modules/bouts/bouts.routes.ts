import { Router } from "express";
import {
  boutIdParamsSchema,
  recordBoutResultSchema,
  cancelBoutSchema,
  correctBoutResultSchema,
  pauseBoutSchema,
  academyIdParamsSchema,
} from "@karate/validation";
import { authenticate, optionalAuthenticate } from "../../middleware/auth";
import { requireRole, requireAcademyAdministrator } from "../../middleware/rbac";
import { validate } from "../../middleware/validate";
import {
  getBoutHandler,
  callBoutHandler,
  markBoutReadyHandler,
  pauseBoutHandler,
  resumeBoutHandler,
  recordBoutResultHandler,
  finalizeBoutHandler,
  sendBoutToReviewHandler,
  cancelBoutHandler,
  getMyBoutsHandler,
  getMyStudentsBoutsHandler,
  getAcademyBoutsHandler,
  correctBoutResultHandler,
} from "./bouts.controller";

/** Mounted at /api/v1/bouts in app.ts — extends the existing (Phase 12) boutsRouter with the full bout lifecycle. */
export const boutLifecycleRouter = Router();

boutLifecycleRouter.get(
  "/:boutId",
  optionalAuthenticate,
  validate(boutIdParamsSchema, "params"),
  getBoutHandler,
);

boutLifecycleRouter.post(
  "/:boutId/call",
  authenticate,
  requireRole("ACADEMY"),
  validate(boutIdParamsSchema, "params"),
  callBoutHandler,
);

boutLifecycleRouter.post(
  "/:boutId/ready",
  authenticate,
  requireRole("ACADEMY"),
  validate(boutIdParamsSchema, "params"),
  markBoutReadyHandler,
);

boutLifecycleRouter.post(
  "/:boutId/pause",
  authenticate,
  requireRole("ACADEMY"),
  validate(boutIdParamsSchema, "params"),
  validate(pauseBoutSchema),
  pauseBoutHandler,
);

boutLifecycleRouter.post(
  "/:boutId/resume",
  authenticate,
  requireRole("ACADEMY"),
  validate(boutIdParamsSchema, "params"),
  resumeBoutHandler,
);

boutLifecycleRouter.post(
  "/:boutId/result",
  authenticate,
  requireRole("ACADEMY"),
  validate(boutIdParamsSchema, "params"),
  validate(recordBoutResultSchema),
  recordBoutResultHandler,
);

boutLifecycleRouter.post(
  "/:boutId/finalize",
  authenticate,
  requireRole("ACADEMY"),
  validate(boutIdParamsSchema, "params"),
  finalizeBoutHandler,
);

boutLifecycleRouter.post(
  "/:boutId/result/correct",
  authenticate,
  requireRole("ACADEMY"),
  validate(boutIdParamsSchema, "params"),
  validate(correctBoutResultSchema),
  correctBoutResultHandler,
);

boutLifecycleRouter.post(
  "/:boutId/review",
  authenticate,
  requireRole("ACADEMY"),
  validate(boutIdParamsSchema, "params"),
  sendBoutToReviewHandler,
);

boutLifecycleRouter.post(
  "/:boutId/cancel",
  authenticate,
  requireRole("ACADEMY"),
  validate(boutIdParamsSchema, "params"),
  validate(cancelBoutSchema),
  cancelBoutHandler,
);

/** Mounted at /api/v1/players/me/bouts in app.ts. */
export const playerBoutsRouter = Router();
playerBoutsRouter.get("/", authenticate, requireRole("PLAYER"), getMyBoutsHandler);

/** Mounted at /api/v1/coaches/me/students-bouts in app.ts. */
export const coachStudentsBoutsRouter = Router();
coachStudentsBoutsRouter.get("/", authenticate, requireRole("COACH"), getMyStudentsBoutsHandler);

/** Mounted at /api/v1/academies/:academyId/bouts in app.ts. */
export const academyBoutsRouter = Router({ mergeParams: true });
academyBoutsRouter.get(
  "/",
  authenticate,
  validate(academyIdParamsSchema, "params"),
  requireAcademyAdministrator(),
  getAcademyBoutsHandler,
);
