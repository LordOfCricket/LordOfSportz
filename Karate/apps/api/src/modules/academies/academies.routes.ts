import { Router } from "express";
import {
  createAcademyRequestSchema,
  membershipRequestActionSchema,
  academyIdParamsSchema,
  updateAcademyRequestSchema,
  academySearchQuerySchema,
  createMembershipRequestSchema,
} from "@karate/validation";
import { authenticate } from "../../middleware/auth";
import { requireRole, requireAcademyAdministrator } from "../../middleware/rbac";
import { validate } from "../../middleware/validate";
import {
  createAcademyHandler,
  searchAcademiesHandler,
  getAcademyHandler,
  listMyAcademiesHandler,
  updateAcademyHandler,
  createMembershipRequestHandler,
  listPendingMembershipRequestsHandler,
  resolveMembershipRequestHandler,
  listActivePlayersHandler,
} from "./academies.controller";

export const academiesRouter = Router();

academiesRouter.get("/", validate(academySearchQuerySchema, "query"), searchAcademiesHandler);

academiesRouter.get("/mine", authenticate, requireRole("ACADEMY"), listMyAcademiesHandler);

academiesRouter.post(
  "/",
  authenticate,
  requireRole("ACADEMY"),
  validate(createAcademyRequestSchema),
  createAcademyHandler,
);

academiesRouter.get("/:academyId", validate(academyIdParamsSchema, "params"), getAcademyHandler);

academiesRouter.patch(
  "/:academyId",
  authenticate,
  validate(academyIdParamsSchema, "params"),
  requireAcademyAdministrator(),
  validate(updateAcademyRequestSchema),
  updateAcademyHandler,
);

academiesRouter.post(
  "/:academyId/membership-requests",
  authenticate,
  requireRole("COACH", "PLAYER"),
  validate(academyIdParamsSchema, "params"),
  validate(createMembershipRequestSchema),
  createMembershipRequestHandler,
);

academiesRouter.get(
  "/:academyId/players",
  authenticate,
  validate(academyIdParamsSchema, "params"),
  requireAcademyAdministrator(),
  listActivePlayersHandler,
);

academiesRouter.get(
  "/:academyId/membership-requests",
  authenticate,
  validate(academyIdParamsSchema, "params"),
  requireAcademyAdministrator(),
  listPendingMembershipRequestsHandler,
);

academiesRouter.post(
  "/:academyId/membership-requests/resolve",
  authenticate,
  validate(academyIdParamsSchema, "params"),
  requireAcademyAdministrator(),
  validate(membershipRequestActionSchema),
  resolveMembershipRequestHandler,
);
