import * as scoringService from '../services/scoring.service.js'
import * as commentaryService from '../services/commentary.service.js'
import { selectWagonWheelShots, getTimeline, groupDeliveriesByOver, getLastWicket } from '../domain/scoring/selectors.js'
import { publishMatchState, publishCommentary } from '../realtime/cricketRealtime.js'
import { ensureEarningRecordsForMatch } from '../models/umpireEarning.model.js'
import { logger } from '../utils/logger.js'

function serializeState({ innings, state, format }) {
  return {
    innings: {
      id: innings.id,
      matchId: innings.match_id,
      inningsNumber: innings.innings_number,
      battingTeamId: innings.batting_team_id,
      bowlingTeamId: innings.bowling_team_id,
      status: innings.status,
      version: innings.version,
    },
    format,
    score: { runs: state.runs, wickets: state.wickets, legalBalls: state.legalBalls, overNumber: state.overNumber, ballInOver: state.ballInOver },
    striker: state.ends.strikerEnd,
    nonStriker: state.ends.nonStrikerEnd,
    bowler: state.deliveries.length ? state.deliveries[state.deliveries.length - 1].bowlerMatchPlayerId : null,
    isFreeHitNext: state.isFreeHitNext,
    isAllOut: state.isAllOut,
    isOversComplete: state.isOversComplete,
    isTargetChased: state.isTargetChased,
    pendingBatsmanSelection: state.pendingBatsmanSelection,
    batsmen: state.batsmen,
    bowlers: state.bowlers,
    partnership: state.partnership,
    fallOfWickets: state.fallOfWickets,
    lastWicket: getLastWicket(state.fallOfWickets),
    conflicts: state.conflicts,
  }
}

export async function listInnings(req, res, next) {
  try {
    const innings = await scoringService.listInningsByMatch(req.params.matchId)
    res.json({ innings })
  } catch (err) {
    next(err)
  }
}

export async function createInnings(req, res, next) {
  try {
    const { inningsNumber, battingTeamId, bowlingTeamId } = req.body
    if (!inningsNumber || !battingTeamId || !bowlingTeamId) {
      return res.status(400).json({ message: 'inningsNumber, battingTeamId and bowlingTeamId are required.' })
    }
    const innings = await scoringService.createInnings({ matchId: req.params.matchId, inningsNumber, battingTeamId, bowlingTeamId })
    res.status(201).json({ innings })
  } catch (err) {
    next(err)
  }
}

export async function addMatchPlayer(req, res, next) {
  try {
    const { teamId, playerId, isPlayingXi, isCaptain, isWicketkeeper, battingOrder } = req.body
    if (!teamId || !playerId) {
      return res.status(400).json({ message: 'teamId and playerId are required.' })
    }
    const matchPlayer = await scoringService.addMatchPlayer({
      matchId: req.params.matchId,
      teamId,
      playerId,
      isPlayingXi,
      isCaptain,
      isWicketkeeper,
      battingOrder,
    })
    res.status(201).json({ matchPlayer })
  } catch (err) {
    next(err)
  }
}

export async function listMatchPlayers(req, res, next) {
  try {
    const matchPlayers = await scoringService.listMatchPlayers(req.params.matchId)
    res.json({ matchPlayers })
  } catch (err) {
    next(err)
  }
}

export async function getInningsState(req, res, next) {
  try {
    const result = await scoringService.getInningsState(req.params.inningsId)
    if (!result) return res.status(404).json({ message: 'Innings not found.' })
    res.json(serializeState(result))
  } catch (err) {
    next(err)
  }
}

export async function getInningsTimeline(req, res, next) {
  try {
    const result = await scoringService.getInningsState(req.params.inningsId)
    if (!result) return res.status(404).json({ message: 'Innings not found.' })
    res.json({
      timeline: getTimeline(result.state),
      byOver: groupDeliveriesByOver(result.state.deliveries),
    })
  } catch (err) {
    next(err)
  }
}

export async function getWagonWheel(req, res, next) {
  try {
    const result = await scoringService.getInningsState(req.params.inningsId)
    if (!result) return res.status(404).json({ message: 'Innings not found.' })
    const shots = await scoringService.listWagonWheelShots(req.params.inningsId)
    const shotsByDeliveryId = new Map(shots.map((s) => [String(s.delivery_id), s]))
    res.json({ shots: selectWagonWheelShots(result.state.deliveries, shotsByDeliveryId) })
  } catch (err) {
    next(err)
  }
}

function parseDeliveryInput(body) {
  return {
    isDeadBall: Boolean(body.isDeadBall),
    batRuns: body.batRuns || 0,
    illegal: body.illegal || null,
    extra: body.extra || null,
    wicket: body.wicket || null,
    swapStrikerNonStriker: Boolean(body.swapStrikerNonStriker),
    bowlerMatchPlayerId: body.bowlerMatchPlayerId,
    shot: body.shot || null,
  }
}

// Phase 11: publish only for a REAL write — an idempotent replay of an
// already-processed clientActionId changed nothing, so re-broadcasting it
// would be a harmless but wasteful no-op (Part 36). Fire-and-forget: the
// scorer's response is never held up waiting on spectator delivery, and
// publishMatchState never throws (Part 78/79 — a realtime hiccup must not
// surface as a scoring failure).
function maybePublish(req, result, reason) {
  if (!result.idempotentReplay) publishMatchState(req.io, result.matchId, reason)
}

// Umpire Communication & Commercial 2.0 — the scoring engine's own
// auto-completion path (maybeCompleteInnings, called inside recordDelivery/
// recordEvent's transaction) never touches earnings itself, to avoid an
// aborted-transaction hazard: a caught error mid-transaction still leaves
// Postgres unable to commit the writes before it. Hooking in here instead —
// strictly after the response is already sent, same fire-and-forget
// contract as maybePublish/maybePublishCommentary — means a bug here can
// never undo the officiating-credit writes that already committed.
// Idempotent (ON CONFLICT DO NOTHING), so a swallowed failure just
// self-heals on the next earnings read.
async function maybeEnsureEarnings(result) {
  if (!result.completion?.match) return
  try {
    await ensureEarningRecordsForMatch(result.matchId)
  } catch (err) {
    logger.error('ensureEarningRecordsForMatch failed after scoring-engine match completion', { matchId: result.matchId, error: err.message })
  }
}

// Phase 12: commentary generation/persistence is a SEPARATE step from the
// cricket write above — it runs only after that write already committed, and
// its own failure is caught here and logged only (Part 38: an already-
// committed delivery is never rolled back because commentary failed, and the
// scorer's response — already sent by the time this runs — is never
// affected). Persist-then-publish (Part 37): the socket only fires with rows
// that are already durably in commentary_entries.
async function maybePublishCommentary(req, result, inningsId) {
  if (result.idempotentReplay) return
  try {
    const { entries, inningsVersion, matchId } = await commentaryService.appendCommentaryForInnings(inningsId)
    if (entries.length) publishCommentary(req.io, matchId, { inningsId, inningsVersion, mode: 'append', entries })
  } catch (err) {
    logger.error('Commentary append failed', { inningsId, error: err.message })
  }
}

export async function recordDelivery(req, res, next) {
  try {
    const result = await scoringService.recordDelivery({
      inningsId: req.params.inningsId,
      expectedVersion: req.body.expectedVersion ?? null,
      clientActionId: req.body.clientActionId ?? null,
      recordedByUserId: req.user?.id ?? null,
      input: parseDeliveryInput(req.body),
    })
    res.status(201).json(result)
    maybePublish(req, result, result.completion?.match ? 'match_completed' : 'delivery')
    maybePublishCommentary(req, result, req.params.inningsId)
    maybeEnsureEarnings(result)
  } catch (err) {
    next(err)
  }
}

export async function recordEvent(req, res, next) {
  try {
    const { eventType, payload, deliveryId, expectedVersion, clientActionId } = req.body
    if (!eventType) return res.status(400).json({ message: 'eventType is required.' })
    const result = await scoringService.recordEvent({
      inningsId: req.params.inningsId,
      expectedVersion: expectedVersion ?? null,
      clientActionId: clientActionId ?? null,
      event: { eventType, payload: payload || {}, deliveryId: deliveryId ?? null },
    })
    res.status(201).json(result)
    maybePublish(req, result, result.completion?.match ? 'match_completed' : 'event')
    maybePublishCommentary(req, result, req.params.inningsId)
    maybeEnsureEarnings(result)
  } catch (err) {
    next(err)
  }
}
