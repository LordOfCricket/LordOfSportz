import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import { requireRole, requireAcademyAdministrator } from "../../middleware/rbac";
import { validate } from "../../middleware/validate";
import { academyIdParamsSchema } from "@karate/validation";
import { playerResultsHandler, playerStatsHandler, coachStatsHandler, coachResultsHandler, tournamentResultsHandler, tournamentStatsHandler, academyStatsHandler } from "./stats.controller";
import * as ranking from "./ranking.service";
import { asyncHandler } from "../../errors/asyncHandler";

export const playerResultsRouter = Router();
playerResultsRouter.use(authenticate, requireRole("PLAYER"));
playerResultsRouter.get("/results", playerResultsHandler);
playerResultsRouter.get("/stats", playerStatsHandler);

export const tournamentStatsRouter = Router({ mergeParams: true });
tournamentStatsRouter.get("/results", tournamentResultsHandler);
tournamentStatsRouter.get("/stats", tournamentStatsHandler);

export const academyStatsRouter = Router({ mergeParams: true });
academyStatsRouter.get("/stats", authenticate, validate(academyIdParamsSchema, "params"), requireAcademyAdministrator(), academyStatsHandler);

export const coachStatsRouter = Router();
coachStatsRouter.get("/stats", authenticate, requireRole("COACH"), coachStatsHandler);
coachStatsRouter.get("/results", authenticate, requireRole("COACH"), coachResultsHandler);

export const rankingsRouter = Router();
rankingsRouter.get("/categories", asyncHandler(async (req, res) => { res.json({ success: true, data: await ranking.listCategories(), meta: { requestId: req.requestId, timestamp: new Date().toISOString() } }); }));
rankingsRouter.get("/:categoryId/history", asyncHandler(async (req, res) => { res.json({ success: true, data: await ranking.getRankingHistory(req.params["categoryId"]!), meta: { requestId: req.requestId, timestamp: new Date().toISOString() } }); }));
rankingsRouter.get("/:categoryId", asyncHandler(async (req, res) => { res.json({ success: true, data: await ranking.getRanking(req.params["categoryId"]!), meta: { requestId: req.requestId, timestamp: new Date().toISOString() } }); }));
