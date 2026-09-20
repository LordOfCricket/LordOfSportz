import { Router } from "express";
import { verifyBeltHistorySchema, historyIdParamsSchema, academyIdParamsSchema } from "@karate/validation";
import { authenticate } from "../../middleware/auth";
import { requireRole, requireAcademyAdministrator } from "../../middleware/rbac";
import { validate } from "../../middleware/validate";
import { verifyBeltHistoryHandler, listPendingVerificationsHandler } from "./beltHistory.controller";

export const beltHistoryRouter = Router();

beltHistoryRouter.post(
  "/:historyId/verify",
  authenticate,
  requireRole("ACADEMY"),
  validate(historyIdParamsSchema, "params"),
  validate(verifyBeltHistorySchema),
  verifyBeltHistoryHandler,
);

/** Mounted separately at /academies/:academyId/pending-verifications — see app.ts. */
export const academyPendingVerificationsRouter = Router({ mergeParams: true });
academyPendingVerificationsRouter.get(
  "/",
  authenticate,
  validate(academyIdParamsSchema, "params"),
  requireAcademyAdministrator(),
  listPendingVerificationsHandler,
);
