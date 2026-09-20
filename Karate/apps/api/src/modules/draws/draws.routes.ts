import { Router } from "express";
import { competitionIdParamsSchema, drawIdParamsSchema, generateDrawSchema } from "@karate/validation";
import { authenticate, optionalAuthenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { validate } from "../../middleware/validate";
import { generateDrawHandler, getDrawHandler, publishDrawHandler, lockDrawHandler } from "./draws.controller";

/** Mounted at /api/v1/competitions/:competitionId/draw in app.ts. */
export const competitionDrawRouter = Router({ mergeParams: true });

competitionDrawRouter.post(
  "/",
  authenticate,
  requireRole("ACADEMY"),
  validate(competitionIdParamsSchema, "params"),
  validate(generateDrawSchema),
  generateDrawHandler,
);

competitionDrawRouter.get(
  "/",
  optionalAuthenticate,
  validate(competitionIdParamsSchema, "params"),
  getDrawHandler,
);

/** Mounted at /api/v1/draws in app.ts. */
export const drawsRouter = Router();

drawsRouter.post(
  "/:drawId/publish",
  authenticate,
  requireRole("ACADEMY"),
  validate(drawIdParamsSchema, "params"),
  publishDrawHandler,
);

drawsRouter.post(
  "/:drawId/lock",
  authenticate,
  requireRole("ACADEMY"),
  validate(drawIdParamsSchema, "params"),
  lockDrawHandler,
);
