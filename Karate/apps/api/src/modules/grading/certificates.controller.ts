import type { Request, Response } from "express";
import { asyncHandler } from "../../errors/asyncHandler";
import * as service from "./certificates.service";

export const verifyCertificateHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.verifyCertificateByCode(req.params["code"]!);
  res.status(200).json({
    success: true,
    data: result,
    meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
  });
});
