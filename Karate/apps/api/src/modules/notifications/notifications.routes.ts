import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import { asyncHandler } from "../../errors/asyncHandler";
import * as service from "./notifications.service";

export const notificationsRouter = Router();
notificationsRouter.get("/", authenticate, asyncHandler(async (req, res) => { res.json({ success: true, data: await service.listForUser(req.user!.id), meta: { requestId: req.requestId, timestamp: new Date().toISOString() } }); }));
notificationsRouter.post("/:notificationId/read", authenticate, asyncHandler(async (req, res) => { res.json({ success: true, data: await service.markRead(req.user!.id, req.params["notificationId"]!), meta: { requestId: req.requestId, timestamp: new Date().toISOString() } }); }));
