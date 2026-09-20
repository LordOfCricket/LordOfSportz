import type { Request, Response } from "express";
import { ValidationError } from "@karate/shared";
import { asyncHandler } from "../../errors/asyncHandler";
import * as service from "./beltHistory.service";

export const listPendingVerificationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const academyId = req.params["academyId"];
  if (!academyId) throw new ValidationError("Missing academyId route parameter.");

  const result = await service.listPendingVerificationsForAcademy(academyId);
  res.status(200).json({
    success: true,
    data: result,
    meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
  });
});

export const verifyBeltHistoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const historyId = req.params["historyId"];
  if (!historyId) throw new ValidationError("Missing historyId route parameter.");

  const result = await service.verifyBeltHistory(historyId, req.user!.id, req.body);
  res.status(200).json({
    success: true,
    data: result,
    meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
  });
});
