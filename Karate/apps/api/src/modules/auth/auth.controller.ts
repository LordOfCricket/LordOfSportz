import type { Request, Response } from "express";
import type { ApiSuccessResponse } from "@karate/types";
import { asyncHandler } from "../../errors/asyncHandler";
import * as authService from "./auth.service";
import * as refreshService from "./refresh.service";
import { AuthenticationError } from "@karate/shared";
import { cricketMe, cricketRedeem, issueForFederatedUser } from "./federation.service";
import { issueRealtimeToken } from "../../lib/realtime";

export const registerHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.register(req.body);
  const body: ApiSuccessResponse<typeof result> = {
    success: true,
    data: result,
    meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
  };
  res.status(201).json(body);
});

export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body);
  const body: ApiSuccessResponse<typeof result> = {
    success: true,
    data: result,
    meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
  };
  res.status(200).json(body);
});

export const meHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.getCurrentUser(req.user!.id);
  const body: ApiSuccessResponse<typeof result> = {
    success: true,
    data: result,
    meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
  };
  res.status(200).json(body);
});

export const realtimeTokenHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = { token: issueRealtimeToken(req.user!.id), expiresInSeconds: 60 };
  res.status(200).json({ success: true, data: result, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
});

export const refreshHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await refreshService.refreshTokens(req.body.refreshToken, req.log);
  const body: ApiSuccessResponse<typeof result> = {
    success: true,
    data: result,
    meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
  };
  res.status(200).json(body);
});

export const logoutHandler = asyncHandler(async (req: Request, res: Response) => {
  await refreshService.logoutSession(req.body.refreshToken);
  req.log.info("refresh session revoked (logout)");
  const body: ApiSuccessResponse<{ loggedOut: true }> = {
    success: true,
    data: { loggedOut: true },
    meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
  };
  res.status(200).json(body);
});

export const ssoHandler = asyncHandler(async (req: Request, res: Response) => {
  const code = typeof req.body.code === "string" ? req.body.code : null;
  const redeemed = code ? await cricketRedeem(code) : null;
  const cricketUser = redeemed ? redeemed.user : await cricketMe(String(req.body.sessionCookie ?? ""));
  const issued = cricketUser && (await issueForFederatedUser(cricketUser.email, cricketUser.name));
  if (!issued) throw new AuthenticationError("No valid shared session.");
  const result = redeemed ? { ...issued, cricketSessionCookie: redeemed.setCookie } : issued;
  res.status(200).json({ success: true, data: result, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
});
