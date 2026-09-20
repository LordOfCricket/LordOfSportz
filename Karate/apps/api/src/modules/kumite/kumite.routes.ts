import { Router } from "express";
import {
  boutIdParamsSchema,
  submitKumiteScoreSchema,
  cancelKumiteScoreSchema,
  applyKumitePenaltySchema,
  submitHanteiVotesSchema,
  finalizeKumiteResultSchema,
  requestVideoReviewSchema,
  decideVideoReviewSchema,
  videoReviewIdParamsSchema,
} from "@karate/validation";
import { authenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { validate } from "../../middleware/validate";
import {
  getKumiteStateHandler,
  submitKumiteScoreHandler,
  cancelKumiteScoreHandler,
  applyKumitePenaltyHandler,
  submitHanteiVotesHandler,
  finalizeKumiteResultHandler,
  startKumiteClockHandler,
  pauseKumiteClockHandler,
  resumeKumiteClockHandler,
  requestVideoReviewHandler,
  decideVideoReviewHandler,
} from "./kumite.controller";

/** Mounted at /api/v1/bouts/:boutId/kumite in app.ts. Function-level authorization (REFEREE/JUDGE/TIMEKEEPER, and tournament/tatami/competition scope) is enforced inside kumite.service.ts, not here — only a SCORER-role account can even reach these actions. */
export const kumiteRouter = Router({ mergeParams: true });

kumiteRouter.get("/", authenticate, validate(boutIdParamsSchema, "params"), getKumiteStateHandler);

kumiteRouter.post(
  "/score",
  authenticate,
  requireRole("SCORER"),
  validate(boutIdParamsSchema, "params"),
  validate(submitKumiteScoreSchema),
  submitKumiteScoreHandler,
);

kumiteRouter.post(
  "/score/cancel",
  authenticate,
  requireRole("SCORER"),
  validate(boutIdParamsSchema, "params"),
  validate(cancelKumiteScoreSchema),
  cancelKumiteScoreHandler,
);

kumiteRouter.post(
  "/penalty",
  authenticate,
  requireRole("SCORER"),
  validate(boutIdParamsSchema, "params"),
  validate(applyKumitePenaltySchema),
  applyKumitePenaltyHandler,
);

kumiteRouter.post(
  "/hantei",
  authenticate,
  requireRole("SCORER"),
  validate(boutIdParamsSchema, "params"),
  validate(submitHanteiVotesSchema),
  submitHanteiVotesHandler,
);

kumiteRouter.post(
  "/finalize",
  authenticate,
  requireRole("SCORER"),
  validate(boutIdParamsSchema, "params"),
  validate(finalizeKumiteResultSchema),
  finalizeKumiteResultHandler,
);

kumiteRouter.post(
  "/clock/start",
  authenticate,
  requireRole("SCORER"),
  validate(boutIdParamsSchema, "params"),
  startKumiteClockHandler,
);
kumiteRouter.post(
  "/clock/pause",
  authenticate,
  requireRole("SCORER"),
  validate(boutIdParamsSchema, "params"),
  pauseKumiteClockHandler,
);
kumiteRouter.post(
  "/clock/resume",
  authenticate,
  requireRole("SCORER"),
  validate(boutIdParamsSchema, "params"),
  resumeKumiteClockHandler,
);

kumiteRouter.post(
  "/video-review",
  authenticate,
  requireRole("COACH"),
  validate(boutIdParamsSchema, "params"),
  validate(requestVideoReviewSchema),
  requestVideoReviewHandler,
);

kumiteRouter.post(
  "/video-review/:requestId/decide",
  authenticate,
  requireRole("SCORER"),
  validate(videoReviewIdParamsSchema, "params"),
  validate(decideVideoReviewSchema),
  decideVideoReviewHandler,
);
