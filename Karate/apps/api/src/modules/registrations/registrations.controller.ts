import type { Request, Response } from "express";
import type { MedicalDecisionRequest, RecordWeighInRequest, RequestReweighRequest } from "@karate/validation";
import { asyncHandler } from "../../errors/asyncHandler";
import * as registrationsService from "./registrations.service";
import * as eligibilityService from "./eligibility.service";
import * as medicalService from "./medical.service";
import * as weighInService from "./weighIn.service";

function respond(res: Response, req: Request, status: number, data: unknown) {
  res
    .status(status)
    .json({ success: true, data, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
}

export const createRegistrationHandler = asyncHandler(async (req: Request, res: Response) => {
  const registration = await registrationsService.createRegistration(req.user!.id, req.user!.roles, req.body);
  respond(res, req, 201, registration);
});

export const listMyRegistrationsHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await registrationsService.listMyRegistrations(req.user!.id));
});

export const getRegistrationHandler = asyncHandler(async (req: Request, res: Response) => {
  const { registrationId } = req.params as unknown as { registrationId: string };
  respond(res, req, 200, await registrationsService.getRegistrationById(registrationId, req.user!.id));
});

export const withdrawRegistrationHandler = asyncHandler(async (req: Request, res: Response) => {
  const { registrationId } = req.params as unknown as { registrationId: string };
  respond(res, req, 200, await registrationsService.withdrawRegistration(registrationId, req.user!.id));
});

export const listAcademyRegistrationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { academyId } = req.params as unknown as { academyId: string };
  respond(res, req, 200, await registrationsService.listAcademyRegistrations(academyId));
});

export const listMyStudentsRegistrationsHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await registrationsService.listMyStudentsRegistrations(req.user!.id));
});

export const reevaluateEligibilityHandler = asyncHandler(async (req: Request, res: Response) => {
  const { registrationId } = req.params as unknown as { registrationId: string };
  respond(res, req, 200, await eligibilityService.reevaluateEligibility(registrationId, req.user!.id));
});

export const overrideEligibilityHandler = asyncHandler(async (req: Request, res: Response) => {
  const { registrationId } = req.params as unknown as { registrationId: string };
  const { status, notes } = req.body as {
    status: "ELIGIBLE" | "INELIGIBLE" | "MANUAL_REVIEW";
    notes?: string;
  };
  respond(
    res,
    req,
    200,
    await eligibilityService.overrideEligibility(registrationId, req.user!.id, status, notes),
  );
});

export const recordMedicalDecisionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { registrationId } = req.params as unknown as { registrationId: string };
  const { status, notes, expiresAt } = req.body as MedicalDecisionRequest;
  respond(
    res,
    req,
    200,
    await medicalService.recordMedicalDecision(registrationId, req.user!.id, status, notes, expiresAt),
  );
});

export const recordWeighInHandler = asyncHandler(async (req: Request, res: Response) => {
  const { registrationId } = req.params as unknown as { registrationId: string };
  const input = req.body as RecordWeighInRequest;
  respond(res, req, 201, await weighInService.recordWeighInAttempt(registrationId, req.user!.id, input));
});

export const requestReweighHandler = asyncHandler(async (req: Request, res: Response) => {
  const { registrationId } = req.params as unknown as { registrationId: string };
  const { reason } = req.body as RequestReweighRequest;
  respond(res, req, 201, await weighInService.requestReweigh(registrationId, req.user!.id, reason));
});

export const getWeighInHistoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const { registrationId } = req.params as unknown as { registrationId: string };
  // Reuses the registration access check so weigh-in history is visible to
  // exactly the same audience as the registration itself, no wider.
  await registrationsService.getRegistrationById(registrationId, req.user!.id);
  respond(res, req, 200, await weighInService.getWeighInHistory(registrationId));
});
