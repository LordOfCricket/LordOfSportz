import api from './api'

// Thin mobile client for the server-authoritative scoring API. Mirrors
// client/src/services/scoringApi.js exactly — no business logic here, every
// cricket rule stays on the server (replay/validate domain). Only the
// endpoints the mobile Umpire match-day workspace needs are wrapped.

export function generateClientActionId(): string {
  // expo/hermes exposes global crypto.randomUUID on SDK 50+
  const c = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export interface WagonWheelShotInput {
  normalizedX: number
  normalizedY: number
  angleDegrees: number
  regionId: string
  shotType?: string | null
}

export interface DeliveryInput {
  batRuns?: number
  illegal?: { type: 'wide' | 'no-ball'; runs: number } | null
  extra?: { type: 'bye' | 'leg-bye'; runs: number } | null
  wicket?: {
    type: string
    dismissedMatchPlayerId?: number
    runsCompleted?: number
    fielderMatchPlayerId?: number
  } | null
  swapStrikerNonStriker?: boolean
  isDeadBall?: boolean
  shot?: WagonWheelShotInput | null
}

export interface InningsStateBatsman {
  runs: number
  balls: number
  fours: number
  sixes: number
  out: boolean
  dismissal?: unknown
}
export interface InningsStateBowler {
  legalBalls: number
  runs: number
  dots: number
  wickets?: number
  wides: number
  noBalls: number
}

export interface InningsState {
  innings: {
    id: number
    matchId: number
    inningsNumber: number
    battingTeamId: number
    bowlingTeamId: number
    status: 'upcoming' | 'live' | 'completed'
    version: number
  }
  format: unknown
  score: { runs: number; wickets: number; legalBalls: number; overNumber: number; ballInOver: number }
  striker: number | null
  nonStriker: number | null
  bowler: number | null
  isFreeHitNext: boolean
  isAllOut: boolean
  isOversComplete: boolean
  isTargetChased: boolean
  pendingBatsmanSelection: 'strikerEnd' | 'nonStrikerEnd' | null
  batsmen: Record<string, InningsStateBatsman>
  bowlers: Record<string, InningsStateBowler>
  partnership: { runs: number; balls: number } | null
  fallOfWickets: { wicketNumber: number; runs: number; overLabel?: string; matchPlayerId?: number }[]
  lastWicket: unknown
  conflicts: unknown
}

// getTimeline() spreads each enriched row: { kind, id, ...delivery|event }.
// For a delivery row `id` IS the delivery id; there is no `deliveryId` field.
export interface TimelineEntry {
  kind: 'delivery' | 'event'
  id: number
  logSequence?: number
  over?: number
  ball?: number
  totalRuns?: number
  isLegalDelivery?: boolean
  voided?: boolean
  wicket?: unknown
  eventType?: string
}
export interface TimelineOver {
  over: number
  deliveries: { id: number; totalRuns: number; wicket?: unknown; voided?: boolean }[]
}
export interface InningsTimeline {
  timeline: TimelineEntry[]
  byOver: TimelineOver[]
}

export interface WagonWheelShotRow {
  deliveryId: number
  normalizedX: number
  normalizedY: number
  angleDegrees: number
  regionId: string
  runs?: number
}

export interface MatchPlayerRow {
  id: number
  match_id: number
  team_id: number
  player_id: number
  name: string
  public_player_id: string | null
  is_playing_xi: boolean
  is_captain: boolean
  is_wicketkeeper: boolean
  batting_order: number | null
}

export interface InningsRow {
  id: number
  match_id: number
  innings_number: number
  batting_team_id: number
  bowling_team_id: number
  status: 'upcoming' | 'live' | 'completed'
  version: number
}

export interface CorrectionRow {
  id: number
  target_type: 'delivery' | 'event'
  target_id: number
  reason_code: string
  note: string | null
  created_at: string
  undone_at: string | null
}

// --- match lifecycle -----------------------------------------------------

export async function setToss(matchId: number, body: { tossWinnerId: number; tossDecision: 'bat' | 'bowl' }): Promise<void> {
  await api.patch(`/matches/${matchId}/toss`, body)
}

export async function startMatch(matchId: number, opts?: { confirmUnderstaffed?: boolean }): Promise<void> {
  await api.post(`/matches/${matchId}/start`, opts ?? {})
}

export async function finalizeMatch(matchId: number): Promise<void> {
  await api.post(`/matches/${matchId}/finalize`, {})
}

export async function getMatchChecklist(matchId: number): Promise<{ items: { key: string; label: string; checked: boolean }[] }> {
  const { data } = await api.get(`/matches/${matchId}/checklist`)
  return data
}

export async function updateChecklistItem(matchId: number, key: string, checked: boolean): Promise<void> {
  await api.patch(`/matches/${matchId}/checklist`, { key, checked })
}

// --- innings / players -------------------------------------------------

export async function listMatchPlayers(matchId: number): Promise<MatchPlayerRow[]> {
  const { data } = await api.get(`/matches/${matchId}/match-players`)
  return data.matchPlayers ?? []
}

export async function listInnings(matchId: number): Promise<InningsRow[]> {
  const { data } = await api.get(`/matches/${matchId}/innings`)
  return data.innings ?? []
}

export async function createInnings(
  matchId: number,
  body: { inningsNumber: number; battingTeamId: number; bowlingTeamId: number },
): Promise<InningsRow> {
  const { data } = await api.post(`/matches/${matchId}/innings`, body)
  return data.innings
}

// --- innings read models ---------------------------------------------

export async function getInningsState(inningsId: number): Promise<InningsState> {
  const { data } = await api.get(`/innings/${inningsId}/state`)
  return data
}

export async function getInningsTimeline(inningsId: number): Promise<InningsTimeline> {
  const { data } = await api.get(`/innings/${inningsId}/timeline`)
  return data
}

export async function getWagonWheel(inningsId: number): Promise<WagonWheelShotRow[]> {
  const { data } = await api.get(`/innings/${inningsId}/wagon-wheel`)
  return data.shots ?? []
}

// --- writes ---------------------------------------------------------

export async function recordDelivery(
  inningsId: number,
  body: DeliveryInput & { expectedVersion: number; clientActionId: string; bowlerMatchPlayerId: number },
): Promise<{ idempotentReplay?: boolean; completion?: unknown }> {
  const { data } = await api.post(`/innings/${inningsId}/deliveries`, body)
  return data
}

export async function recordEvent(
  inningsId: number,
  body: { expectedVersion: number; clientActionId: string; eventType: string; payload?: Record<string, unknown>; deliveryId?: number | null },
): Promise<unknown> {
  const { data } = await api.post(`/innings/${inningsId}/events`, body)
  return data
}

// --- corrections --------------------------------------------------

export async function previewCorrection(
  inningsId: number,
  body: { targetType: 'delivery' | 'event'; targetId: number; patch: Record<string, unknown> },
): Promise<{ diff?: unknown; projected?: unknown; message?: string }> {
  const { data } = await api.post(`/innings/${inningsId}/corrections/preview`, body)
  return data
}

export async function applyCorrection(
  inningsId: number,
  body: {
    targetType: 'delivery' | 'event'
    targetId: number
    patch: Record<string, unknown>
    reasonCode: string
    note?: string
    expectedVersion: number
    clientActionId: string
  },
): Promise<unknown> {
  const { data } = await api.post(`/innings/${inningsId}/corrections`, body)
  return data
}

export async function getCorrectionHistory(inningsId: number): Promise<CorrectionRow[]> {
  const { data } = await api.get(`/innings/${inningsId}/corrections`)
  return data.corrections ?? []
}

export async function undoCorrection(
  inningsId: number,
  correctionId: number,
  body: { expectedVersion: number; clientActionId: string },
): Promise<unknown> {
  const { data } = await api.post(`/innings/${inningsId}/corrections/${correctionId}/undo`, body)
  return data
}
