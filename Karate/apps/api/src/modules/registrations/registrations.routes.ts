import { Router } from "express";
import {
  createRegistrationSchema,
  registrationIdParamsSchema,
  academyIdParamsSchema,
  eligibilityOverrideSchema,
  medicalDecisionSchema,
  recordWeighInSchema,
  requestReweighSchema,
} from "@karate/validation";
import { authenticate } from "../../middleware/auth";
import { requireRole, requireAcademyAdministrator } from "../../middleware/rbac";
import { validate } from "../../middleware/validate";
import {
  createRegistrationHandler,
  listMyRegistrationsHandler,
  getRegistrationHandler,
  withdrawRegistrationHandler,
  listAcademyRegistrationsHandler,
  listMyStudentsRegistrationsHandler,
  reevaluateEligibilityHandler,
  overrideEligibilityHandler,
  recordMedicalDecisionHandler,
  recordWeighInHandler,
  requestReweighHandler,
  getWeighInHistoryHandler,
} from "./registrations.controller";

export const registrationsRouter = Router();

registrationsRouter.use(authenticate);

registrationsRouter.post(
  "/",
  requireRole("PLAYER", "COACH", "ACADEMY"),
  validate(createRegistrationSchema),
  createRegistrationHandler,
);

registrationsRouter.get("/me", requireRole("PLAYER"), listMyRegistrationsHandler);

registrationsRouter.get(
  "/:registrationId",
  validate(registrationIdParamsSchema, "params"),
  getRegistrationHandler,
);

registrationsRouter.post(
  "/:registrationId/withdraw",
  validate(registrationIdParamsSchema, "params"),
  withdrawRegistrationHandler,
);

registrationsRouter.post(
  "/:registrationId/eligibility/re-evaluate",
  validate(registrationIdParamsSchema, "params"),
  reevaluateEligibilityHandler,
);

/** Organizer-only — see eligibility.service#overrideEligibility for why the competing academy is never authorized here. */
registrationsRouter.post(
  "/:registrationId/eligibility/override",
  requireRole("ACADEMY"),
  validate(registrationIdParamsSchema, "params"),
  validate(eligibilityOverrideSchema),
  overrideEligibilityHandler,
);

/** Organizer-only, same conflict-of-interest reasoning as the eligibility override. Players can never reach this route. */
registrationsRouter.post(
  "/:registrationId/medical/decision",
  requireRole("ACADEMY"),
  validate(registrationIdParamsSchema, "params"),
  validate(medicalDecisionSchema),
  recordMedicalDecisionHandler,
);

/** Organizer-only — see weighIn.service for why the pass/fail result is always server-computed. */
registrationsRouter.post(
  "/:registrationId/weigh-in",
  requireRole("ACADEMY"),
  validate(registrationIdParamsSchema, "params"),
  validate(recordWeighInSchema),
  recordWeighInHandler,
);

registrationsRouter.post(
  "/:registrationId/weigh-in/reweigh",
  requireRole("ACADEMY"),
  validate(registrationIdParamsSchema, "params"),
  validate(requestReweighSchema),
  requestReweighHandler,
);

registrationsRouter.get(
  "/:registrationId/weigh-in",
  validate(registrationIdParamsSchema, "params"),
  getWeighInHistoryHandler,
);

/** Mounted at /api/v1/coaches/me/students-registrations in app.ts. */
export const coachStudentsRegistrationsRouter = Router();
coachStudentsRegistrationsRouter.get(
  "/",
  authenticate,
  requireRole("COACH"),
  listMyStudentsRegistrationsHandler,
);

export const academyRegistrationsRouter = Router({ mergeParams: true });
academyRegistrationsRouter.get(
  "/",
  authenticate,
  validate(academyIdParamsSchema, "params"),
  requireAcademyAdministrator(),
  listAcademyRegistrationsHandler,
);
