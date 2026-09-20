import * as correctionService from '../services/correction.service.js'
import * as commentaryService from '../services/commentary.service.js'
import { publishMatchState, publishCommentary } from '../realtime/cricketRealtime.js'
import { logger } from '../utils/logger.js'

// Phase 12: a correction can change MANY commentary entries at once (a
// milestone that no longer exists, a wicket now attributed to someone else,
// every score-after value downstream of the edit) — so this always does a
// full rebuild (Part 30) and tells spectators to resync over HTTP rather
// than trying to describe what changed (Part 40). Same isolation as the
// realtime match:state publish beside it: a rebuild failure is logged and
// never surfaces as a correction failure (Part 38/78) — the correction
// itself already committed successfully.
async function rebuildAndPublishCommentary(req, inningsId) {
  try {
    const result = await commentaryService.rebuildInningsCommentary(inningsId)
    if (result) publishCommentary(req.io, result.matchId, { inningsId: Number(inningsId), inningsVersion: result.inningsVersion, mode: 'resync' })
  } catch (err) {
    logger.error('Commentary rebuild failed', { inningsId, error: err.message })
  }
}

function parseTarget(body) {
  const { targetType, targetId, patch } = body
  if (!['delivery', 'event'].includes(targetType)) {
    return { error: "targetType must be 'delivery' or 'event'." }
  }
  if (targetId == null) return { error: 'targetId is required.' }
  if (!patch || typeof patch !== 'object') return { error: 'patch is required.' }
  return { targetType, targetId, patch }
}

export async function previewCorrection(req, res, next) {
  try {
    const parsed = parseTarget(req.body)
    if (parsed.error) return res.status(400).json({ message: parsed.error })

    const result = await correctionService.previewCorrection({ inningsId: req.params.inningsId, ...parsed })
    if (!result) return res.status(404).json({ message: 'Innings not found.' })
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function applyCorrection(req, res, next) {
  try {
    const parsed = parseTarget(req.body)
    if (parsed.error) return res.status(400).json({ message: parsed.error })
    const { reasonCode, note, expectedVersion, clientActionId } = req.body
    if (!reasonCode) return res.status(400).json({ message: 'reasonCode is required.' })

    const result = await correctionService.applyCorrection({
      inningsId: req.params.inningsId,
      ...parsed,
      reasonCode,
      note: note ?? null,
      expectedVersion: expectedVersion ?? null,
      clientActionId: clientActionId ?? null,
      correctedByUserId: req.user.id,
    })
    res.status(201).json(result)
    if (!result.idempotentReplay) {
      publishMatchState(req.io, result.matchId, 'correction')
      rebuildAndPublishCommentary(req, req.params.inningsId)
    }
  } catch (err) {
    next(err)
  }
}

export async function listCorrections(req, res, next) {
  try {
    const corrections = await correctionService.listCorrections(req.params.inningsId)
    res.json({ corrections })
  } catch (err) {
    next(err)
  }
}

export async function undoCorrection(req, res, next) {
  try {
    const { expectedVersion, clientActionId } = req.body
    const result = await correctionService.undoCorrection({
      inningsId: req.params.inningsId,
      correctionId: req.params.correctionId,
      expectedVersion: expectedVersion ?? null,
      clientActionId: clientActionId ?? null,
      correctedByUserId: req.user.id,
    })
    res.status(201).json(result)
    if (!result.idempotentReplay) {
      publishMatchState(req.io, result.matchId, 'correction_undo')
      rebuildAndPublishCommentary(req, req.params.inningsId)
    }
  } catch (err) {
    next(err)
  }
}
