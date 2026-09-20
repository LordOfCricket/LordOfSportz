// Pure display helpers for Match Briefing — same "fixed taxonomy, plain
// label lookup" convention as STATUS_COPY (umpireStatus.model.js). Keys must
// match the backend's own fixed CHECKLIST_ITEMS/INCIDENT_TYPES exactly
// (matchChecklist.service.js / matchIncident.service.js).

export const CHECKLIST_LABELS = {
  ARRIVED_AT_GROUND: 'Arrived at Ground',
  PITCH_INSPECTED: 'Pitch inspected',
  CREASES_CHECKED: 'Creases checked',
  TEAMS_CONFIRMED: 'Teams confirmed',
  PLAYING_XI_CONFIRMED: 'Playing XI confirmed',
  BALL_CONFIRMED: 'Ball confirmed',
  TOSS_COMPLETED: 'Toss completed',
  READY_TO_START: 'Ready to Start',
}

export const INCIDENT_TYPE_LABELS = {
  RAIN: 'Rain',
  INJURY: 'Injury',
  BAD_LIGHT: 'Bad Light',
  GROUND_CONDITION: 'Ground Condition',
  PLAYER_MISCONDUCT: 'Player Misconduct',
  EQUIPMENT_ISSUE: 'Equipment Issue',
  TECHNICAL_PROBLEM: 'Technical Problem',
  MATCH_ABANDONED: 'Match Abandoned',
  OTHER: 'Other',
}

export const INCIDENT_TYPES = Object.keys(INCIDENT_TYPE_LABELS)

export function checklistLabel(itemKey) {
  return CHECKLIST_LABELS[itemKey] || itemKey
}

export function incidentTypeLabel(type) {
  return INCIDENT_TYPE_LABELS[type] || type
}

export function checklistProgress(items) {
  const total = items?.length || 0
  const done = (items || []).filter((i) => i.isChecked).length
  return { total, done, allDone: total > 0 && done === total }
}
