import { findAuditLogPage } from '../models/accountAuditLog.model.js'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

// SUPER_ADMIN Identity & Secure Provisioning feature — "Audit Logs" (§15),
// super_admin-only. metadata is returned as-is (JSONB) — every recordEvent
// call site across this codebase already never puts plaintext passwords/
// OTPs/tokens/MFA secrets into it (§15's own explicit rule), so there is
// nothing further to redact here.
export async function listAuditLog(req, res, next) {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT))
    const page = Math.max(1, Number(req.query.page) || 1)
    const offset = (page - 1) * limit
    const eventType = typeof req.query.eventType === 'string' && req.query.eventType ? req.query.eventType : undefined

    const { rows, total } = await findAuditLogPage({ eventType, limit, offset })

    res.json({
      events: rows.map((r) => ({
        id: r.id,
        eventType: r.event_type,
        actorUserId: r.actor_user_id,
        actorName: r.actor_name,
        targetUserId: r.target_user_id,
        targetName: r.target_name,
        metadata: r.metadata,
        createdAt: r.created_at,
      })),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    })
  } catch (err) {
    next(err)
  }
}
