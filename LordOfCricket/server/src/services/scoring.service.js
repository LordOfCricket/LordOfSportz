// Orchestrates the authoritative scoring flow: PostgreSQL repository loads
// context -> pure domain replay/validate -> PostgreSQL repository persists.
// This is the ONLY place that opens the scoring transaction — controllers
// never touch `pool`/`client` directly, and the domain layer (replay.js,
// validate.js) never imports `pg`.

import { pool } from '../config/db.js'
import { replayInnings } from '../domain/scoring/replay.js'
import { validateDeliveryInput, validateEventInput } from '../domain/scoring/validate.js'
import { ScoringError, SCORING_ERROR_CODES as CODES } from '../domain/scoring/errors.js'
import { deriveMatchResult } from '../domain/scoring/matchResult.js'
import * as inningsRepo from '../repositories/innings.repository.js'
import * as deliveryRepo from '../repositories/delivery.repository.js'
import * as matchEventRepo from '../repositories/matchEvent.repository.js'
import * as wicketRepo from '../repositories/wicket.repository.js'
import * as wagonWheelRepo from '../repositories/wagonWheel.repository.js'
import * as matchPlayerRepo from '../repositories/matchPlayer.repository.js'
import * as matchModel from '../models/match.model.js'
import { markSlotsCompletedForMatch, insertAssignmentEvent } from '../models/matchUmpireSlot.model.js'

// Exported so correction.service.js (Phase 4/6) reuses exactly the same
// format/seed resolution instead of a second copy that could drift.
// `battingTeamId`/`inningsNumber` are optional context Phase 6 needs for the
// roster-aware all-out threshold and (innings 2+ only) the live chase target
// — omitted, replayInnings falls back to the legacy defaults (10 wickets, no
// target), which is exactly what keeps every pre-Phase-6 caller/test unaffected.
export async function loadFormat(matchId, { battingTeamId, inningsNumber } = {}, client = pool) {
  const { rows } = await client.query('SELECT overs_per_innings, balls_per_over, rules FROM matches WHERE id = $1', [matchId])
  const m = rows[0]
  if (!m) throw new ScoringError(CODES.INVALID_INNINGS_STATE, 'Match not found.', { matchId })

  const battingTeamPlayingXiCount = battingTeamId != null ? await matchPlayerRepo.countPlayingXi(matchId, battingTeamId, client) : null

  let target = null
  if (inningsNumber != null && inningsNumber > 1) {
    const { rows: firstInningsRows } = await client.query('SELECT runs FROM innings WHERE match_id = $1 AND innings_number = 1', [matchId])
    if (firstInningsRows[0]) target = firstInningsRows[0].runs + 1
  }

  return {
    oversPerInnings: m.overs_per_innings ?? null,
    ballsPerOver: m.balls_per_over ?? 6,
    powerplayOvers: m.rules?.powerplayOvers,
    battingTeamPlayingXiCount,
    target,
  }
}

/**
 * Called after every successful delivery/event write. If the freshly-replayed
 * state means the innings is now over (all out / overs complete / target
 * chased), transitions innings.status -> 'completed' and, for innings 2+,
 * derives and persists the match result in the SAME transaction — never a
 * separate follow-up write, so there's no window where the innings is over
 * but the match doesn't know it yet.
 */
export async function maybeCompleteInnings(client, innings, format, stateAfter) {
  if (innings.status !== 'live') return null
  if (!(stateAfter.isAllOut || stateAfter.isOversComplete || stateAfter.isTargetChased)) return null

  await inningsRepo.updateInningsStatus(innings.id, 'completed', {}, client)

  if (innings.innings_number < 2) return null // innings break — no match-level decision yet

  const { rows } = await client.query('SELECT * FROM innings WHERE match_id = $1 AND innings_number = 1', [innings.match_id])
  const innings1 = rows[0]
  if (!innings1) return null // defensive — should never happen once innings 2 exists

  const result = deriveMatchResult(
    { battingTeamId: innings1.batting_team_id, runs: innings1.runs },
    { battingTeamId: innings.batting_team_id, runs: stateAfter.runs, wickets: stateAfter.wickets, battingTeamPlayingXiCount: format.battingTeamPlayingXiCount }
  )

  const match = await matchModel.updateMatch(
    innings.match_id,
    {
      status: 'completed',
      completed_at: new Date(),
      winner_team_id: result.winnerTeamId,
      result_type: result.resultType,
      result_margin: result.resultMargin,
      result: result.resultText,
    },
    client
  )

  // Officiating credit (Phase 23) — the scoring-engine auto-completion path,
  // same hook match.service.js#completeMatchManually uses for the manual
  // "Match is Over" path, kept in this same transaction so the match result
  // and the umpires' COMPLETED credit can never diverge.
  const completedSlots = await markSlotsCompletedForMatch(innings.match_id, client)
  for (const slot of completedSlots) {
    await insertAssignmentEvent({ slotId: slot.id, matchId: innings.match_id, umpireUserId: slot.umpire_user_id, eventType: 'COMPLETED' }, client)
  }

  return { match, result }
}

/**
 * Correction-time counterpart to maybeCompleteInnings — handles BOTH
 * directions, since a historical correction can just as easily make a
 * previously-complete innings no-longer-complete (e.g. removing a wicket that
 * had caused all-out) as the reverse. Only transitions innings.status; match-
 * level result recomputation is recomputeMatchResultIfDecided's job, called
 * separately so it applies uniformly regardless of which innings changed.
 */
export async function syncInningsStatusAfterCorrection(client, innings, stateAfter) {
  const shouldBeComplete = stateAfter.isAllOut || stateAfter.isOversComplete || stateAfter.isTargetChased
  if (shouldBeComplete && innings.status === 'live') {
    await inningsRepo.updateInningsStatus(innings.id, 'completed', {}, client)
  } else if (!shouldBeComplete && innings.status === 'completed') {
    await inningsRepo.updateInningsStatus(innings.id, 'live', { skipStartedAt: true }, client)
  }
}

/**
 * Re-derives the match result from CURRENT cached innings totals — a no-op
 * unless the match already has a persisted result (status = 'completed'), so
 * it's safe to call after any correction to either innings without first
 * figuring out whether that correction was relevant. Only reachable while
 * 'completed' and not yet 'finalized' — see correction.service.js's lock.
 */
export async function recomputeMatchResultIfDecided(client, matchId) {
  const { rows: matchRows } = await client.query('SELECT * FROM matches WHERE id = $1', [matchId])
  const match = matchRows[0]
  if (!match || match.status !== 'completed') return null

  const { rows: inningsRows } = await client.query('SELECT * FROM innings WHERE match_id = $1 ORDER BY innings_number', [matchId])
  const innings1 = inningsRows.find((i) => i.innings_number === 1)
  const innings2 = inningsRows.find((i) => i.innings_number === 2)
  if (!innings1 || !innings2) return null // defensive — shouldn't happen once a result exists

  const battingTeamPlayingXiCount = await matchPlayerRepo.countPlayingXi(matchId, innings2.batting_team_id, client)
  const result = deriveMatchResult(
    { battingTeamId: innings1.batting_team_id, runs: innings1.runs },
    { battingTeamId: innings2.batting_team_id, runs: innings2.runs, wickets: innings2.wickets, battingTeamPlayingXiCount }
  )

  return matchModel.updateMatch(
    matchId,
    { winner_team_id: result.winnerTeamId, result_type: result.resultType, result_margin: result.resultMargin, result: result.resultText },
    client
  )
}

export function seedFrom(innings) {
  return { battingTeamId: innings.batting_team_id, bowlingTeamId: innings.bowling_team_id }
}

// Phase 6 Part 8: the frontend proposes which teams bat/bowl for innings 2+,
// but never gets to arbitrarily decide it — it must be the exact reverse of
// the innings immediately before it.
export async function createInnings({ matchId, inningsNumber, battingTeamId, bowlingTeamId }) {
  if (inningsNumber > 1) {
    const existing = await inningsRepo.listInningsByMatch(matchId)
    const previous = existing.find((i) => i.innings_number === inningsNumber - 1)
    if (previous && (previous.batting_team_id !== bowlingTeamId || previous.bowling_team_id !== battingTeamId)) {
      throw new ScoringError(
        CODES.INVALID_INNINGS_STATE,
        `Innings ${inningsNumber} must reverse innings ${inningsNumber - 1}'s batting/bowling teams.`,
        { matchId, inningsNumber, battingTeamId, bowlingTeamId }
      )
    }
  }
  return inningsRepo.createInnings({ matchId, inningsNumber, battingTeamId, bowlingTeamId })
}

export async function listInningsByMatch(matchId) {
  return inningsRepo.listInningsByMatch(matchId)
}

// Roster changes are only meaningful before a match starts — the Playing XI
// is fixed at 'live' (Phase 6 Part 22: finalized/completed/live matches must
// reject roster changes affecting official match history).
export async function addMatchPlayer(params) {
  const { rows } = await pool.query('SELECT status FROM matches WHERE id = $1', [params.matchId])
  if (!rows[0]) throw new ScoringError(CODES.INVALID_INNINGS_STATE, 'Match not found.', { matchId: params.matchId })
  if (rows[0].status !== 'upcoming') {
    throw new ScoringError(CODES.MATCH_LOCKED, `Cannot change the roster once a match is '${rows[0].status}'.`, { matchId: params.matchId })
  }
  return matchPlayerRepo.createMatchPlayer(params)
}

export async function listMatchPlayers(matchId) {
  return matchPlayerRepo.listMatchPlayers(matchId)
}

/** Load + replay an innings from PostgreSQL with no reliance on any server
 * memory — the "server restart never loses the ability to reconstruct the
 * innings" acceptance criterion, exercised on literally every read. */
export async function getInningsState(inningsId) {
  const innings = await inningsRepo.findInningsById(inningsId)
  if (!innings) return null
  const format = await loadFormat(innings.match_id, { battingTeamId: innings.batting_team_id, inningsNumber: innings.innings_number })
  const log = await inningsRepo.loadInningsLog(inningsId)
  const state = replayInnings(log, seedFrom(innings), format)
  return { innings, state, format }
}

export async function listInningsDeliveries(inningsId) {
  return deliveryRepo.listDeliveriesByInnings(inningsId)
}

export async function listInningsEvents(inningsId) {
  return matchEventRepo.listMatchEventsByInnings(inningsId)
}

export async function listWagonWheelShots(inningsId) {
  return wagonWheelRepo.listShotsByInnings(inningsId)
}

/**
 * Records one delivery inside a single transaction:
 *  lock innings -> idempotency check -> version check -> load+replay existing
 *  log -> validate -> assign log_sequence + bump version -> insert delivery
 *  (+ wicket + wagon-wheel-shot) -> replay again including the new entry ->
 *  write back every derived/cache column -> commit.
 *
 * `expectedVersion` answers "was the scorer acting on current state?".
 * `clientActionId` answers "have I already processed this exact submission?"
 * — checked first and independent of the version check, so a network retry of
 * an already-applied action is a safe no-op even if the innings has since moved on.
 */
export async function recordDelivery({ inningsId, expectedVersion, clientActionId, recordedByUserId, input }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const innings = await inningsRepo.lockInningsForUpdate(client, inningsId)
    if (!innings) throw new ScoringError(CODES.INVALID_INNINGS_STATE, 'Innings not found.', { inningsId })

    if (clientActionId) {
      const existing = await deliveryRepo.findDeliveryByClientActionId(client, inningsId, clientActionId)
      if (existing) {
        await client.query('ROLLBACK')
        return { delivery: existing, idempotentReplay: true, version: innings.version }
      }
    }

    if (expectedVersion != null && innings.version !== expectedVersion) {
      throw new ScoringError(CODES.VERSION_CONFLICT, `Innings has moved to version ${innings.version}; client expected ${expectedVersion}.`, {
        currentVersion: innings.version,
        expectedVersion,
      })
    }

    const format = await loadFormat(innings.match_id, { battingTeamId: innings.batting_team_id, inningsNumber: innings.innings_number }, client)
    const matchPlayersById = await matchPlayerRepo.getMatchPlayersMap(innings.match_id, client)
    const existingLog = await inningsRepo.loadInningsLog(inningsId, client)
    const seed = seedFrom(innings)
    const stateBefore = replayInnings(existingLog, seed, format)

    validateDeliveryInput({
      input,
      state: stateBefore,
      matchPlayersById,
      battingTeamId: innings.batting_team_id,
      bowlingTeamId: innings.bowling_team_id,
      inningsStatus: innings.status,
    })

    const logSequence = await inningsRepo.claimNextLogSequence(client, inningsId)
    const bumped = await inningsRepo.bumpVersion(client, inningsId, innings.version)
    if (bumped == null) {
      throw new ScoringError(CODES.VERSION_CONFLICT, 'Innings version changed unexpectedly during recording.', { inningsId })
    }

    const deliveryRow = await deliveryRepo.insertDelivery(client, { inningsId, logSequence, recordedByUserId, clientActionId, input })

    // Replay BEFORE inserting the wicket row: for every dismissal type except
    // run-out, dismissed_match_player_id is derived (= the striker replay
    // computes for this delivery), not scorer input, and the column is
    // NOT NULL — so it has to be known at insert time, not patched in after.
    const newEntry = { kind: 'delivery', id: String(deliveryRow.id), logSequence, ...input, wicket: input.wicket || null }
    const stateAfter = replayInnings([...existingLog, newEntry], seed, format)
    const enrichedDelivery = stateAfter.deliveries[stateAfter.deliveries.length - 1]

    if (input.wicket) {
      const dismissedMatchPlayerId =
        input.wicket.type === 'run-out' ? input.wicket.dismissedMatchPlayerId : enrichedDelivery.strikerMatchPlayerId
      await wicketRepo.insertWicket(client, deliveryRow.id, { ...input.wicket, dismissedMatchPlayerId })
    }
    if (input.shot) {
      await wagonWheelRepo.insertShot(client, deliveryRow.id, input.shot)
    }

    await deliveryRepo.updateDeliveryDerivedFields(client, deliveryRow.id, enrichedDelivery)

    await inningsRepo.updateInningsCache(client, inningsId, {
      runs: stateAfter.runs,
      wickets: stateAfter.wickets,
      legalBalls: stateAfter.legalBalls,
      strikerMatchPlayerId: stateAfter.ends.strikerEnd,
      nonStrikerMatchPlayerId: stateAfter.ends.nonStrikerEnd,
      bowlerMatchPlayerId: enrichedDelivery.bowlerMatchPlayerId,
      isFreeHitNext: stateAfter.isFreeHitNext,
    })

    const completion = await maybeCompleteInnings(client, innings, format, stateAfter)

    await client.query('COMMIT')
    return { delivery: { ...deliveryRow, ...enrichedDelivery }, state: stateAfter, version: bumped, completion, matchId: innings.match_id }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** Same shape as recordDelivery, for non-delivery match events (batsman-in,
 * bowler-change, retire, penalty-runs, catch-dropped, appeal, review, ...). */
export async function recordEvent({ inningsId, expectedVersion, clientActionId, event }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const innings = await inningsRepo.lockInningsForUpdate(client, inningsId)
    if (!innings) throw new ScoringError(CODES.INVALID_INNINGS_STATE, 'Innings not found.', { inningsId })

    if (clientActionId) {
      const existing = await matchEventRepo.findMatchEventByClientActionId(client, inningsId, clientActionId)
      if (existing) {
        await client.query('ROLLBACK')
        return { event: existing, idempotentReplay: true, version: innings.version }
      }
    }

    if (expectedVersion != null && innings.version !== expectedVersion) {
      throw new ScoringError(CODES.VERSION_CONFLICT, `Innings has moved to version ${innings.version}; client expected ${expectedVersion}.`, {
        currentVersion: innings.version,
        expectedVersion,
      })
    }

    const format = await loadFormat(innings.match_id, { battingTeamId: innings.batting_team_id, inningsNumber: innings.innings_number }, client)
    const matchPlayersById = await matchPlayerRepo.getMatchPlayersMap(innings.match_id, client)
    const existingLog = await inningsRepo.loadInningsLog(inningsId, client)
    const seed = seedFrom(innings)
    const stateBefore = replayInnings(existingLog, seed, format)

    validateEventInput({
      event,
      state: stateBefore,
      matchPlayersById,
      battingTeamId: innings.batting_team_id,
      bowlingTeamId: innings.bowling_team_id,
      inningsStatus: innings.status,
    })

    const logSequence = await inningsRepo.claimNextLogSequence(client, inningsId)
    const bumped = await inningsRepo.bumpVersion(client, inningsId, innings.version)
    if (bumped == null) {
      throw new ScoringError(CODES.VERSION_CONFLICT, 'Innings version changed unexpectedly during recording.', { inningsId })
    }

    const eventRow = await matchEventRepo.insertMatchEvent(client, {
      inningsId,
      deliveryId: event.deliveryId ?? null,
      logSequence,
      clientActionId,
      eventType: event.eventType,
      payload: event.payload || {},
    })

    const newEntry = { kind: 'event', id: String(eventRow.id), logSequence, eventType: event.eventType, payload: event.payload || {}, voided: false }
    const stateAfter = replayInnings([...existingLog, newEntry], seed, format)
    const lastDelivery = stateAfter.deliveries[stateAfter.deliveries.length - 1]

    await inningsRepo.updateInningsCache(client, inningsId, {
      runs: stateAfter.runs,
      wickets: stateAfter.wickets,
      legalBalls: stateAfter.legalBalls,
      strikerMatchPlayerId: stateAfter.ends.strikerEnd,
      nonStrikerMatchPlayerId: stateAfter.ends.nonStrikerEnd,
      bowlerMatchPlayerId: lastDelivery ? lastDelivery.bowlerMatchPlayerId : null,
      isFreeHitNext: stateAfter.isFreeHitNext,
    })

    const completion = await maybeCompleteInnings(client, innings, format, stateAfter)

    await client.query('COMMIT')
    return { event: eventRow, state: stateAfter, version: bumped, completion, matchId: innings.match_id }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
