import { Router } from "express";
import { createBeltSystemSchema, createBeltGradeSchema, beltSystemIdParamsSchema } from "@karate/validation";
import { authenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { validate } from "../../middleware/validate";
import {
  listBeltSystemsHandler,
  createBeltSystemHandler,
  listBeltGradesHandler,
  createBeltGradeHandler,
} from "./beltSystems.controller";

export const beltSystemsRouter = Router();

// Belt systems/grades are shared configuration (like KarateStyle), not academy-owned data —
// reads are public, writes require the ACADEMY role (no per-academy ownership check needed).
beltSystemsRouter.get("/", listBeltSystemsHandler);
beltSystemsRouter.post(
  "/",
  authenticate,
  requireRole("ACADEMY"),
  validate(createBeltSystemSchema),
  createBeltSystemHandler,
);

beltSystemsRouter.get(
  "/:beltSystemId/grades",
  validate(beltSystemIdParamsSchema, "params"),
  listBeltGradesHandler,
);
beltSystemsRouter.post(
  "/:beltSystemId/grades",
  authenticate,
  requireRole("ACADEMY"),
  validate(beltSystemIdParamsSchema, "params"),
  validate(createBeltGradeSchema),
  createBeltGradeHandler,
);
