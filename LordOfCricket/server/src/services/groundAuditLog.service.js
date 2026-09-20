import { pool } from '../config/db.js'
import * as auditLogRepo from '../repositories/groundAuditLog.repository.js'
import { logger } from '../utils/logger.js'

// Phase 18 Feature 16 — thin orchestration. `logEvent` never throws past
// itself in a way that could break the caller's own transaction/response —
// audit logging is important but must never be why a booking/cancellation
// fails (same "best-effort side effect, never blocks the primary action"
// posture Google Calendar sync already established).
export async function logEvent({ entityType, entityId, action, actorUserId = null, previousValue = null, newValue = null }) {
  try {
    return await auditLogRepo.insertEntry(pool, { entityType, entityId, action, actorUserId, previousValue, newValue })
  } catch (err) {
    logger.error('Ground audit log write failed', { entityType, entityId, action, error: err.message })
    return null
  }
}

export async function listForEntity(entityType, entityId) {
  return auditLogRepo.listForEntity(entityType, entityId)
}

export async function listRecent({ limit = 50, offset = 0 } = {}) {
  return auditLogRepo.listRecent({ limit, offset })
}
