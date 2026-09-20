import { Router } from "express";
import { createCoachProfileSchema, updateCoachProfileSchema } from "@karate/validation";
import { authenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { validate } from "../../middleware/validate";
import {
  createCoachProfileHandler,
  getMyCoachProfileHandler,
  updateCoachProfileHandler,
  listMyAffiliationsHandler,
  listMyPendingRequestsHandler,
  listMyStudentsGradesHandler,
} from "./coaches.controller";

export const coachesRouter = Router();

coachesRouter.use(authenticate, requireRole("COACH"));
coachesRouter.get("/me", getMyCoachProfileHandler);
coachesRouter.post("/profile", validate(createCoachProfileSchema), createCoachProfileHandler);
coachesRouter.patch("/profile", validate(updateCoachProfileSchema), updateCoachProfileHandler);
coachesRouter.get("/me/affiliations", listMyAffiliationsHandler);
coachesRouter.get("/me/requests", listMyPendingRequestsHandler);
coachesRouter.get("/me/students-grades", listMyStudentsGradesHandler);
