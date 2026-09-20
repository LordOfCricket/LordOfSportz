// Phase 12 — orchestrates the commentary projection: load authoritative
// context from PostgreSQL -> generateInningsCommentary() (pure domain) ->
// persist. Mirrors scoring.service.js's own "repository loads context, pure
// domain derives, repository persists" shape. Commentary is NEVER generated
// from anything except a fresh read of deliveries/match_events/innings/match
// — no write-path in-memory state is ever trusted here (same discipline as
// realtime/cricketRealtime.js#publishMatchState).

import { pool } from '../config/db.js'
import { findMatchByIdWithTeams } from '../models/match.model.js'
import * as inningsRepo from '../repositories/innings.repository.js'
import * as matchPlayerRepo from '../repositories/matchPlayer.repository.js'
import * as wagonWheelRepo from '../repositories/wagonWheel.repository.js'
import * as commentaryRepo from '../repositories/commentary.repository.js'
import { loadFormat, seedFrom } from './scoring.service.js'
import { generateInningsCommentary } from '../domain/commentary/generateInningsCommentary.js'

const DEFAULT_PAGE_LIMIT = 30
const MAX_PAGE_LIMIT = 100

async function loadContext(inningsId, client = pool) {
  const innings = await inningsRepo.findInningsById(inningsId, client)
  if (!innings) return null

  const format = await loadFormat(innings.match_id, { battingTeamId: innings.batting_team_id, inningsNumber: innings.innings_number }, client)
  const log = await inningsRepo.loadInningsLog(inningsId, client)
  const seed = seedFrom(innings)

  const [matchPlayers, shots, match] = await Promise.all([
    matchPlayerRepo.listMatchPlayers(innings.match_id),
    wagonWheelRepo.listShotsByInnings(inningsId),
    findMatchByIdWithTeams(innings.match_id),
  ])

  const roster = new Map(matchPlayers.map((mp) => [mp.id, { name: mp.name, publicPlayerId: mp.public_player_id }]))
  const shotsByDeliveryId = new Map(shots.map((s) => [String(s.delivery_id), s]))
  const teamNames = match ? { [match.team_a_id]: match.team_a_name, [match.team_b_id]: match.team_b_name } : {}

  return { innings, format, log, seed, roster, shotsByDeliveryId, teamNames, match }
}

/**
 * Full replace (Part 30) — used for historical corrections/undo and for
 * backfilling pre-Phase-12 matches (Part 77/78/79). Deletes and regenerates
 * EVERY commentary row for this innings inside one transaction; never
 * touches deliveries/match_events/wickets/innings (read-only against
 * cricket truth, write-only against the projection).
 */
export async function rebuildInningsCommentary(inningsId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const ctx = await loadContext(inningsId, client)
    if (!ctx) {
      await client.query('ROLLBACK')
      return null
    }
    const entries = generateInningsCommentary(ctx).map((e) => ({ ...e, inningsVersion: ctx.innings.version }))
    await commentaryRepo.deleteByInnings(client, inningsId)
    const inserted = await commentaryRepo.insertMany(client, ctx.innings.match_id, inningsId, entries)
    await client.query('COMMIT')
    return { entries: inserted, inningsVersion: ctx.innings.version, matchId: ctx.innings.match_id }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/**
 * Incremental fast path for a normal delivery/event (Part 37) — regenerates
 * the FULL deterministic projection (cheap at club scale, see Part 63/64
 * measurements) but only PERSISTS the entries attributable to the newest log
 * entry, via an idempotent insert (Part 22/70: a retried clientActionId that
 * produced no new log entry also produces no new commentary). Returns only
 * what was actually newly inserted, so the realtime layer broadcasts an
 * honest "append", never a phantom re-announcement of old commentary.
 */
export async function appendCommentaryForInnings(inningsId) {
  const ctx = await loadContext(inningsId, pool)
  if (!ctx) return { entries: [], inningsVersion: null, matchId: null }

  const entries = generateInningsCommentary(ctx)
  const newestIndex = ctx.log.length - 1
  const candidates = entries.filter((e) => e.sourceIndex === newestIndex || e.sourceIndex === -1).map((e) => ({ ...e, inningsVersion: ctx.innings.version }))
  if (candidates.length === 0) return { entries: [], inningsVersion: ctx.innings.version, matchId: ctx.innings.match_id }

  const inserted = await commentaryRepo.insertIfAbsent(pool, ctx.innings.match_id, inningsId, candidates)
  return { entries: inserted, inningsVersion: ctx.innings.version, matchId: ctx.innings.match_id }
}

function clampLimit(limit) {
  const n = Number(limit)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_LIMIT
  return Math.min(Math.trunc(n), MAX_PAGE_LIMIT)
}

/**
 * Public read model (Part 33/34/35). Resolves to the match's LATEST innings
 * when `inningsId` isn't specified — the same "which innings is current"
 * question liveMatch.service.js already answers for match:state.
 */
export async function getCommentaryPage({ matchId, inningsId, before, limit, type }) {
  const inningsRows = await inningsRepo.listInningsByMatch(matchId)
  if (inningsRows.length === 0) return null

  let innings
  if (inningsId != null) {
    innings = inningsRows.find((i) => i.id === Number(inningsId))
    if (!innings) return null
  } else {
    innings = inningsRows[inningsRows.length - 1]
  }

  const pageLimit = clampLimit(limit)
  const rows = await commentaryRepo.listPage(innings.id, { before: before != null ? Number(before) : null, limit: pageLimit + 1, type: type || null })
  const hasMore = rows.length > pageLimit
  const page = hasMore ? rows.slice(0, pageLimit) : rows

  return {
    matchId: Number(matchId),
    inningsId: innings.id,
    inningsNumber: innings.innings_number,
    inningsVersion: innings.version,
    entries: page.map((r) => ({
      id: r.id,
      type: r.type,
      ballLabel: r.ball_label,
      text: r.text,
      tags: r.tags,
      score: r.score_runs != null ? { runs: r.score_runs, wickets: r.score_wickets } : null,
      deliveryId: r.source_delivery_id,
      eventId: r.source_event_id,
      sequence: r.sequence,
    })),
    pagination: { limit: pageLimit, hasMore, nextBefore: hasMore ? page[page.length - 1].sequence : null },
  }
}
