// Phase 4 — historical score correction. Builds directly on Phase 3's
// replayInnings()/previewCorrection() and validate.js: a correction is never
// "score = score - 1", it's "patch one authoritative entry, refold the whole
// innings, persist whatever the replay says is now true." See replay.js's
// module comment and previewCorrection for the mechanics this relies on.

import { pool } from '../config/db.js'
import { replayInnings, previewCorrection as domainPreviewCorrection } from '../domain/scoring/replay.js'
import { validateDeliveryInput, validateEventInput } from '../domain/scoring/validate.js'
import { ScoringError, SCORING_ERROR_CODES as CODES } from '../domain/scoring/errors.js'
import { CORRECTION_REASON_CODES } from '../domain/scoring/correctionReasons.js'
import * as inningsRepo from '../repositories/innings.repository.js'
import * as deliveryRepo from '../repositories/delivery.repository.js'
import * as matchEventRepo from '../repositories/matchEvent.repository.js'
import * as wicketRepo from '../repositories/wicket.repository.js'
import * as wagonWheelRepo from '../repositories/wagonWheel.repository.js'
import * as matchPlayerRepo from '../repositories/matchPlayer.repository.js'
import * as correctionRepo from '../repositories/correction.repository.js'
import { loadFormat, seedFrom, syncInningsStatusAfterCorrection, recomputeMatchResultIfDecided } from './scoring.service.js'

function snapshotDelivery(entry) {
  return {
    isDeadBall: Boolean(entry.isDeadBall),
    batRuns: entry.batRuns || 0,
    illegal: entry.illegal || null,
    extra: entry.extra || null,
    wicket: entry.wicket || null,
    swapStrikerNonStriker: Boolean(entry.swapStrikerNonStriker),
    bowlerMatchPlayerId: entry.bowlerMatchPlayerId,
    voided: Boolean(entry.voided),
  }
}

function snapshotEvent(entry) {
  return { eventType: entry.eventType, payload: entry.payload || {}, voided: Boolean(entry.voided) }
}

// wickets.dismissed_match_player_id is DERIVED for every dismissal type except
// run-out (see wickets table comment in schema.sql). Rows loaded from the DB
// always carry this derived value, so validating an unmodified non-run-out
// wicket against validateDeliveryInput — which rejects an explicit
// dismissedMatchPlayerId on those types, exactly as it does for a brand-new
// delivery — would spuriously fail unless it's stripped first.
function normalizeWicketForValidation(wicket) {
  if (!wicket || wicket.type === 'run-out') return wicket
  const { dismissedMatchPlayerId, ...rest } = wicket
  return rest
}

async function getMatchStatus(matchId, client = pool) {
  const { rows } = await client.query('SELECT status FROM matches WHERE id = $1', [matchId])
  return rows[0]?.status
}

async function findTarget(log, targetType, targetId) {
  const targetEntryId = String(targetId)
  return log.find((e) => e.id === targetEntryId && e.kind === targetType)
}

// allowCompleted: true — a correction is never blocked merely because the
// innings already finished (Phase 6 Part 23: 'completed' still allows
// authorized review). The only hard lock is 'finalized', already checked
// before this is ever reached (see the MATCH_LOCKED check in applyCorrection).
function validatePatchedEntry({ targetType, patchedEntry, state, matchPlayersById, innings }) {
  if (targetType === 'delivery') {
    if (patchedEntry.voided) return // a voided delivery is excluded from scoring — nothing to validate
    validateDeliveryInput({
      input: { ...patchedEntry, wicket: normalizeWicketForValidation(patchedEntry.wicket) },
      state,
      matchPlayersById,
      battingTeamId: innings.batting_team_id,
      bowlingTeamId: innings.bowling_team_id,
      inningsStatus: innings.status,
      allowCompleted: true,
    })
  } else {
    validateEventInput({
      event: patchedEntry,
      state,
      matchPlayersById,
      battingTeamId: innings.batting_team_id,
      bowlingTeamId: innings.bowling_team_id,
      inningsStatus: innings.status,
      allowCompleted: true,
    })
  }
}

/**
 * Read-only. Computes the same before/after replay a real Apply would produce
 * and returns it for the UI, without touching PostgreSQL. `targetId` is a
 * delivery or match_event id (as given by targetType); `patch` is merged onto
 * that entry's authoritative fields exactly like an Apply would.
 */
export async function previewCorrection({ inningsId, targetType, targetId, patch }) {
  const innings = await inningsRepo.findInningsById(inningsId)
  if (!innings) return null

  const format = await loadFormat(innings.match_id, { battingTeamId: innings.batting_team_id, inningsNumber: innings.innings_number })
  const seed = seedFrom(innings)
  const log = await inningsRepo.loadInningsLog(inningsId)
  const target = await findTarget(log, targetType, targetId)
  if (!target) {
    throw new ScoringError(CODES.CORRECTION_TARGET_NOT_FOUND, `${targetType} ${targetId} not found in this innings.`, { targetType, targetId })
  }

  const result = domainPreviewCorrection(log, seed, format, target.id, patch)
  const matchPlayersById = await matchPlayerRepo.getMatchPlayersMap(innings.match_id)
  const stateBeforeTarget = replayInnings(result.patchedLog.slice(0, result.index), seed, format)
  const patchedEntry = result.patchedLog[result.index]

  let validationError = null
  try {
    validatePatchedEntry({ targetType, patchedEntry, state: stateBeforeTarget, matchPlayersById, innings })
  } catch (err) {
    if (!(err instanceof ScoringError)) throw err
    validationError = { code: err.code, message: err.message, details: err.details }
  }

  return {
    inningsId: innings.id,
    currentVersion: innings.version,
    targetType,
    targetId: target.id,
    valid: !result.hasConflicts && !validationError,
    validationError,
    conflicts: result.after.conflicts,
    affectedDeliveryCount: result.affectedDeliveryCount,
    dismissedPlayerChanges: result.dismissedPlayerChanges,
    before: result.before,
    after: result.after,
  }
}

/**
 * Transactional apply. See the module comment for the flow. Never partially
 * persists: any failure past the lock rolls the whole transaction back, so a
 * correction that can't be safely applied leaves zero trace in deliveries/
 * match_events/wickets/wagon_wheel_shots/innings — only in nothing at all,
 * since score_corrections is only written on the success path.
 */
export async function applyCorrection({ inningsId, targetType, targetId, patch, reasonCode, note, expectedVersion, clientActionId, correctedByUserId, undoesCorrectionId = null }) {
  if (!CORRECTION_REASON_CODES.includes(reasonCode)) {
    throw new ScoringError(CODES.INVALID_CORRECTION_REASON, `Unknown reason code '${reasonCode}'.`, { reasonCode })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const innings = await inningsRepo.lockInningsForUpdate(client, inningsId)
    if (!innings) throw new ScoringError(CODES.INVALID_INNINGS_STATE, 'Innings not found.', { inningsId })

    // Locked only once FINALIZED (Phase 6) — a merely 'completed' match still
    // allows authorized review/correction, with the result recomputed below.
    const matchStatus = await getMatchStatus(innings.match_id, client)
    if (matchStatus === 'finalized') {
      throw new ScoringError(CODES.MATCH_LOCKED, 'This match is finalized; historical corrections are locked.', { matchId: innings.match_id })
    }

    if (clientActionId) {
      const existing = await correctionRepo.findCorrectionByClientActionId(client, inningsId, clientActionId)
      if (existing) {
        await client.query('ROLLBACK')
        return { correction: existing, idempotentReplay: true, version: innings.version }
      }
    }

    if (expectedVersion != null && innings.version !== expectedVersion) {
      throw new ScoringError(CODES.VERSION_CONFLICT, `Innings has moved to version ${innings.version}; client expected ${expectedVersion}.`, {
        currentVersion: innings.version,
        expectedVersion,
      })
    }

    const format = await loadFormat(innings.match_id, client)
    const seed = seedFrom(innings)
    const log = await inningsRepo.loadInningsLog(inningsId, client)
    const target = await findTarget(log, targetType, targetId)
    if (!target) throw new ScoringError(CODES.CORRECTION_TARGET_NOT_FOUND, `${targetType} ${targetId} not found in this innings.`, { targetType, targetId })

    const result = domainPreviewCorrection(log, seed, format, target.id, patch)
    if (result.hasConflicts) {
      throw new ScoringError(
        CODES.REPLAY_CONFLICT,
        'This correction leaves the innings in a state with unresolved conflicts and cannot be applied automatically.',
        { conflicts: result.after.conflicts }
      )
    }

    const matchPlayersById = await matchPlayerRepo.getMatchPlayersMap(innings.match_id, client)
    const stateBeforeTarget = replayInnings(result.patchedLog.slice(0, result.index), seed, format)
    const patchedEntry = result.patchedLog[result.index]
    validatePatchedEntry({ targetType, patchedEntry, state: stateBeforeTarget, matchPlayersById, innings })

    // 1. Persist the authoritative patch onto the target row itself.
    if (targetType === 'delivery') {
      await deliveryRepo.updateDeliveryAuthoritativeFields(client, target.id, patchedEntry)

      await wicketRepo.deleteWicketByDelivery(client, target.id)
      if (patchedEntry.wicket) {
        // NOT result.after.deliveries[result.index] — result.index positions the
        // target within the merged delivery+event log, but deliveries here is a
        // deliveries-only array, so that index is only correct by coincidence
        // when no event precedes the target in the log (e.g. never, once the
        // innings has opening batsman-in events before ball one).
        const afterTargetDelivery = result.after.deliveries.find((d) => d.id === target.id)
        const dismissedMatchPlayerId =
          patchedEntry.wicket.type === 'run-out' ? patchedEntry.wicket.dismissedMatchPlayerId : afterTargetDelivery.strikerMatchPlayerId
        await wicketRepo.insertWicket(client, target.id, { ...patchedEntry.wicket, dismissedMatchPlayerId })
      }

      if ('shot' in patch) {
        await wagonWheelRepo.deleteShotByDelivery(client, target.id)
        if (patch.shot) await wagonWheelRepo.insertShot(client, target.id, patch.shot)
      }
    } else {
      await matchEventRepo.updateMatchEventAuthoritativeFields(client, target.id, patchedEntry)
    }

    // 2. Resync every derived/cache column across the WHOLE innings — a
    // correction upstream can shift striker/non-striker/over-ball/legality for
    // every delivery after it, not just the target (Step 1/12 of the brief).
    for (const d of result.after.deliveries) {
      await deliveryRepo.updateDeliveryDerivedFields(client, d.id, d)
      if (d.wicket && d.wicket.type !== 'run-out') {
        await wicketRepo.updateWicketDismissedPlayer(client, d.id, d.strikerMatchPlayerId)
      }
    }

    const lastDelivery = result.after.deliveries[result.after.deliveries.length - 1]
    await inningsRepo.updateInningsCache(client, inningsId, {
      runs: result.after.runs,
      wickets: result.after.wickets,
      legalBalls: result.after.legalBalls,
      strikerMatchPlayerId: result.after.ends.strikerEnd,
      nonStrikerMatchPlayerId: result.after.ends.nonStrikerEnd,
      bowlerMatchPlayerId: lastDelivery ? lastDelivery.bowlerMatchPlayerId : null,
      isFreeHitNext: result.after.isFreeHitNext,
    })

    // 2b. Phase 6: a correction can flip this innings' own completion state in
    // either direction, and — independently — can change a match result that
    // was already decided (e.g. correcting innings 1 changes the target).
    // Known limitation: if innings 2 has already been fully played out and a
    // correction to innings 1 retroactively changes the target, the WINNER/
    // MARGIN are still recomputed correctly from final totals, but the
    // ball-by-ball log for innings 2 is not retroactively trimmed/extended —
    // it keeps whatever was actually, historically bowled.
    await syncInningsStatusAfterCorrection(client, innings, result.after)
    await recomputeMatchResultIfDecided(client, innings.match_id)

    // 3. Version bump + immutable audit row — both or neither.
    const bumped = await inningsRepo.bumpVersion(client, inningsId, innings.version)
    if (bumped == null) {
      throw new ScoringError(CODES.VERSION_CONFLICT, 'Innings version changed unexpectedly during correction.', { inningsId })
    }

    const correctionRow = await correctionRepo.insertCorrection(client, {
      inningsId,
      targetType,
      targetId: target.id,
      reasonCode,
      note,
      beforeData: targetType === 'delivery' ? snapshotDelivery(target) : snapshotEvent(target),
      afterData: targetType === 'delivery' ? snapshotDelivery(patchedEntry) : snapshotEvent(patchedEntry),
      sourceVersion: innings.version,
      resultVersion: bumped,
      correctedByUserId,
      clientActionId,
      undoesCorrectionId,
    })

    await client.query('COMMIT')
    return {
      correction: correctionRow,
      state: result.after,
      version: bumped,
      affectedFromSequence: target.logSequence,
      affectedDeliveryCount: result.affectedDeliveryCount,
      matchId: innings.match_id,
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** An undo is just another audited correction — never mutates or removes the
 * original row (Step 3 of the brief: correction records are immutable). */
export async function undoCorrection({ inningsId, correctionId, expectedVersion, clientActionId, correctedByUserId }) {
  const original = await correctionRepo.findCorrectionById(correctionId)
  if (!original || original.innings_id !== Number(inningsId)) {
    throw new ScoringError(CODES.CORRECTION_TARGET_NOT_FOUND, `Correction ${correctionId} not found in this innings.`, { correctionId })
  }
  const alreadyUndone = await correctionRepo.findUndoOf(correctionId)
  if (alreadyUndone) {
    throw new ScoringError(CODES.CORRECTION_ALREADY_UNDONE, `Correction ${correctionId} has already been undone (by correction ${alreadyUndone.id}).`, {
      correctionId,
      undoneBy: alreadyUndone.id,
    })
  }

  return applyCorrection({
    inningsId,
    targetType: original.target_type,
    targetId: original.target_id,
    patch: original.before_data,
    reasonCode: 'UNDO',
    note: `Undo of correction #${original.id}`,
    expectedVersion,
    clientActionId,
    correctedByUserId,
    undoesCorrectionId: original.id,
  })
}

export async function listCorrections(inningsId) {
  return correctionRepo.listCorrections(inningsId)
}
