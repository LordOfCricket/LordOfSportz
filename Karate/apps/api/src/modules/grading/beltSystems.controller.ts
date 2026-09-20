import type { Request, Response } from "express";
import { ValidationError } from "@karate/shared";
import { asyncHandler } from "../../errors/asyncHandler";
import * as service from "./beltSystems.service";

function respond(res: Response, req: Request, status: number, data: unknown) {
  res
    .status(status)
    .json({ success: true, data, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
}

function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) throw new ValidationError(`Missing ${name} route parameter.`);
  return value;
}

export const listBeltSystemsHandler = asyncHandler(async (req: Request, res: Response) => {
  const styleId = req.query["styleId"] as string | undefined;
  respond(res, req, 200, await service.listBeltSystems(styleId));
});

export const createBeltSystemHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 201, await service.createBeltSystem(req.body));
});

export const listBeltGradesHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 200, await service.listBeltGrades(requireParam(req, "beltSystemId")));
});

export const createBeltGradeHandler = asyncHandler(async (req: Request, res: Response) => {
  respond(res, req, 201, await service.createBeltGrade(requireParam(req, "beltSystemId"), req.body));
});
