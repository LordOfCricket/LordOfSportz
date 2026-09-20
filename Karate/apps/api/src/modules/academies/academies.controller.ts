import type { Request, Response } from "express";
import type { AcademySearchQuery } from "@karate/validation";
import { ValidationError } from "@karate/shared";
import { asyncHandler } from "../../errors/asyncHandler";
import * as academiesService from "./academies.service";

function respond(res: Response, req: Request, status: number, data: unknown) {
  res
    .status(status)
    .json({ success: true, data, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
}

function requireAcademyId(req: Request): string {
  const academyId = req.params["academyId"];
  if (!academyId) {
    throw new ValidationError("Missing academyId route parameter.");
  }
  return academyId;
}

export const createAcademyHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 201, await academiesService.createAcademy(req.user!.id, req.body));
});

export const searchAcademiesHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await academiesService.searchAcademies(req.query as unknown as AcademySearchQuery));
});

export const getAcademyHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await academiesService.getAcademyById(requireAcademyId(req)));
});

export const listMyAcademiesHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await academiesService.listMyAcademies(req.user!.id));
});

export const updateAcademyHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await academiesService.updateAcademy(requireAcademyId(req), req.body));
});

export const createMembershipRequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await academiesService.createMembershipRequest(
    requireAcademyId(req),
    req.user!.id,
    req.body,
  );
  respond(res, req, 201, result);
});

export const listActivePlayersHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await academiesService.listActivePlayers(requireAcademyId(req)));
});

export const listPendingMembershipRequestsHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await academiesService.listPendingMembershipRequests(requireAcademyId(req)));
});

export const resolveMembershipRequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await academiesService.resolveMembershipRequest(
    requireAcademyId(req),
    req.user!.id,
    req.body,
  );
  respond(res, req, 200, result);
});
