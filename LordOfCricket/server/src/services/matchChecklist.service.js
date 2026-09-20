import { findChecklistItems, upsertChecklistItem } from '../models/matchChecklist.model.js'

// Fixed, small taxonomy (Phase 23, Workstream C) — same convention as
// matchIncident.service.js's INCIDENT_TYPES: plain VARCHAR + application
// validation, not a second enum table. Persisted per (match, umpire) rather
// than localStorage, so it survives a refresh/device change and belongs to
// the real assignment.
export const CHECKLIST_ITEMS = [
  'ARRIVED_AT_GROUND',
  'PITCH_INSPECTED',
  'CREASES_CHECKED',
  'TEAMS_CONFIRMED',
  'PLAYING_XI_CONFIRMED',
  'BALL_CONFIRMED',
  'TOSS_COMPLETED',
  'READY_TO_START',
]

function badRequest(message) {
  const err = new Error(message)
  err.statusCode = 400
  return err
}

// Always returns all 8 fixed items, unchecked by default, never just the
// rows that happen to exist — so the frontend renders a complete checklist
// from the very first load, before the umpire has touched anything.
export async function getChecklist(matchId, userId) {
  const rows = await findChecklistItems(matchId, userId)
  const byKey = new Map(rows.map((r) => [r.item_key, r]))
  return CHECKLIST_ITEMS.map((itemKey) => ({
    itemKey,
    isChecked: byKey.get(itemKey)?.is_checked ?? false,
    checkedAt: byKey.get(itemKey)?.checked_at ?? null,
  }))
}

// Route is gated by requireMatchScorerByParam — the same gate scoring
// itself uses — so checklist completion can never bypass match
// authorization; only the actively-assigned umpire can ever reach this.
export async function setChecklistItem(matchId, userId, itemKey, isChecked) {
  if (!CHECKLIST_ITEMS.includes(itemKey)) {
    throw badRequest(`itemKey must be one of: ${CHECKLIST_ITEMS.join(', ')}`)
  }
  const row = await upsertChecklistItem(matchId, userId, itemKey, Boolean(isChecked))
  return { itemKey: row.item_key, isChecked: row.is_checked, checkedAt: row.checked_at }
}
