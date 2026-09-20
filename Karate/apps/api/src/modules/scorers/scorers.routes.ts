import { Router } from "express";
import { createScorerProfileSchema, updateScorerProfileSchema } from "@karate/validation";
import { authenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { validate } from "../../middleware/validate";
import {
  createScorerProfileHandler,
  getMyScorerProfileHandler,
  updateScorerProfileHandler,
} from "./scorers.controller";

export const scorersRouter = Router();

scorersRouter.use(authenticate, requireRole("SCORER"));
scorersRouter.get("/me", getMyScorerProfileHandler);
scorersRouter.post("/profile", validate(createScorerProfileSchema), createScorerProfileHandler);
scorersRouter.patch("/profile", validate(updateScorerProfileSchema), updateScorerProfileHandler);
