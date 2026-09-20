import * as timelineService from '../services/groundTimeline.service.js'
import * as dashboardService from '../services/groundDashboard.service.js'
import * as reportService from '../services/groundReport.service.js'
import * as auditLogService from '../services/groundAuditLog.service.js'
import * as notificationService from '../services/groundNotification.service.js'

// Phase 18 — thin HTTP glue only, same convention as every other controller
// in this codebase.

export async function getTimeline(req, res, next) {
  try {
    const dateStr = String(req.query.date || '')
    const timeline = await timelineService.getDailyTimeline(dateStr)
    res.json(timeline)
  } catch (err) {
    next(err)
  }
}

export async function getDashboard(req, res, next) {
  try {
    const dashboard = await dashboardService.getStaffDashboard()
    res.json(dashboard)
  } catch (err) {
    next(err)
  }
}

export async function getReport(req, res, next) {
  try {
    const { from, to } = req.query
    const report = await reportService.getBookingReport({ fromDate: String(from || ''), toDate: String(to || '') })
    res.json(report)
  } catch (err) {
    next(err)
  }
}

export async function getUtilization(req, res, next) {
  try {
    const { from, to } = req.query
    const utilization = await reportService.getUtilization({ fromDate: String(from || ''), toDate: String(to || '') })
    res.json(utilization)
  } catch (err) {
    next(err)
  }
}

export async function getAuditLog(req, res, next) {
  try {
    const { entityType, entityId, limit, offset } = req.query
    if (entityType && entityId) {
      const entries = await auditLogService.listForEntity(String(entityType), Number(entityId))
      return res.json({ entries })
    }
    const { rows, total } = await auditLogService.listRecent({ limit: limit != null ? Number(limit) : undefined, offset: offset != null ? Number(offset) : undefined })
    res.json({ entries: rows, total })
  } catch (err) {
    next(err)
  }
}

export async function getMyNotifications(req, res, next) {
  try {
    const { limit, offset } = req.query
    const result = await notificationService.listMyNotifications(req.user.id, { limit: limit != null ? Number(limit) : undefined, offset: offset != null ? Number(offset) : undefined })
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function markNotificationRead(req, res, next) {
  try {
    const notification = await notificationService.markRead(Number(req.params.id), req.user.id)
    res.json({ notification })
  } catch (err) {
    next(err)
  }
}

export async function markAllNotificationsRead(req, res, next) {
  try {
    await notificationService.markAllRead(req.user.id)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}
