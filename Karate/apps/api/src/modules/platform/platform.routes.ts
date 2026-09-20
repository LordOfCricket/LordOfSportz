import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { asyncHandler } from "../../errors/asyncHandler";
import { prisma } from "@karate/database";
import { recordAudit } from "../../lib/audit";

export const protestsRouter = Router();
protestsRouter.post("/", authenticate, requireRole("PLAYER", "COACH", "SCORER", "ACADEMY"), asyncHandler(async (req, res) => {
  const { tournamentId, boutId, category, description } = req.body as { tournamentId?: string; boutId?: string; category?: string; description?: string };
  if (!tournamentId || !category || !description?.trim()) { res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "tournamentId, category, and description are required" } }); return; }
  const row = await prisma.protest.create({ data: { tournamentId, boutId, category: category as never, description: description.trim(), raisedByUserId: req.user!.id } });
  await recordAudit(req.user!.id, "PROTEST_SUBMITTED", "Protest", row.id, { category });
  res.status(201).json({ success: true, data: row, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
}));
protestsRouter.get("/tournament/:tournamentId", authenticate, asyncHandler(async (req, res) => {
  const rows = await prisma.protest.findMany({ where: { tournamentId: req.params["tournamentId"] }, orderBy: { createdAt: "desc" } });
  res.json({ success: true, data: rows, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
}));
protestsRouter.post("/:protestId/resolve", authenticate, requireRole("ACADEMY"), asyncHandler(async (req, res) => {
  const { status, resolution } = req.body as { status?: "UPHELD" | "REJECTED"; resolution?: string };
  if (!status || !resolution?.trim()) { res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "status and resolution are required" } }); return; }
  const row = await prisma.protest.findUnique({ where: { id: req.params["protestId"] }, select: { id: true, tournamentId: true } });
  if (!row) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Protest not found" } }); return; }
  const updated = await prisma.protest.update({ where: { id: row.id }, data: { status, resolution: resolution.trim(), resolvedByUserId: req.user!.id, resolvedAt: new Date() } });
  await recordAudit(req.user!.id, "PROTEST_RESOLVED", "Protest", row.id, { status });
  res.json({ success: true, data: updated, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
}));

export const incidentsRouter = Router();
incidentsRouter.post("/", authenticate, asyncHandler(async (req, res) => {
  const { tournamentId, boutId, category, description, severity } = req.body as { tournamentId?: string; boutId?: string; category?: string; description?: string; severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" };
  if (!category || !description?.trim()) { res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "category and description are required" } }); return; }
  const row = await prisma.incident.create({ data: { tournamentId, boutId, category: category.trim(), description: description.trim(), severity, reportedByUserId: req.user!.id } });
  await recordAudit(req.user!.id, "INCIDENT_REPORTED", "Incident", row.id, { category, severity });
  res.status(201).json({ success: true, data: row, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
}));
incidentsRouter.get("/tournament/:tournamentId", authenticate, requireRole("ACADEMY", "SCORER"), asyncHandler(async (req, res) => { const rows = await prisma.incident.findMany({ where: { tournamentId: req.params["tournamentId"] }, orderBy: { createdAt: "desc" } }); res.json({ success: true, data: rows, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } }); }));
