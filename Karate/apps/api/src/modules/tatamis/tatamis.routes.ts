import { Router } from "express";
import {
  tournamentIdParamsSchema,
  createTatamiSchema,
  tatamiIdParamsSchema,
  transitionTatamiStatusSchema,
  boutIdParamsSchema,
} from "@karate/validation";
import { authenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { validate } from "../../middleware/validate";
import {
  createTatamiHandler,
  listTatamisHandler,
  transitionTatamiStatusHandler,
  startBoutHandler,
  completeBoutHandler,
} from "./tatamis.controller";

/** Mounted at /api/v1/tournaments/:tournamentId/tatamis in app.ts. */
export const tournamentTatamisRouter = Router({ mergeParams: true });

tournamentTatamisRouter.post(
  "/",
  authenticate,
  requireRole("ACADEMY"),
  validate(tournamentIdParamsSchema, "params"),
  validate(createTatamiSchema),
  createTatamiHandler,
);

tournamentTatamisRouter.get("/", validate(tournamentIdParamsSchema, "params"), listTatamisHandler);

/** Mounted at /api/v1/tatamis in app.ts. */
export const tatamisRouter = Router();

tatamisRouter.post(
  "/:tatamiId/status",
  authenticate,
  requireRole("ACADEMY"),
  validate(tatamiIdParamsSchema, "params"),
  validate(transitionTatamiStatusSchema),
  transitionTatamiStatusHandler,
);

/** Mounted at /api/v1/bouts in app.ts. */
export const boutsRouter = Router();

boutsRouter.post(
  "/:boutId/start",
  authenticate,
  requireRole("ACADEMY"),
  validate(boutIdParamsSchema, "params"),
  startBoutHandler,
);

boutsRouter.post(
  "/:boutId/complete",
  authenticate,
  requireRole("ACADEMY"),
  validate(boutIdParamsSchema, "params"),
  completeBoutHandler,
);
