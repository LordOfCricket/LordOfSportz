// Phase 10 Part 3 — lightweight spectator live-state read model. Reuses the
// exact same replay engine every other read model trusts
// (scoring.service.js#getInningsState); no independent cricket state, no
// cache table. Deliberately does NOT join teams (Part 50: team identity is
// COLD data the spectator already has from the initial Phase 9 summary
// load — this endpoint is polled every ~3s and stays HOT-data-only).

import { findMatchById } from '../models/match.model.js'
import * as scoringService from './scoring.service.js'
import * as matchPlayerRepo from '../repositories/matchPlayer.repository.js'
import { buildLiveInningsState } from '../domain/liveMatch/buildLiveMatchState.js'

function notFound(message) {
  const err = new Error(message)
  err.statusCode = 404
  return err
}

export async function getLiveMatchState(matchId) {
  const match = await findMatchById(matchId)
  if (!match) throw notFound('Match not found.')

  const inningsRows = await scoringService.listInningsByMatch(matchId)
  const latestRow = inningsRows[inningsRows.length - 1] || null

  // Same rule Phase 9/10 Part 1 already established: 'live' covers both "an
  // innings is being bowled" and "innings 1 finished, innings 2 hasn't
  // started yet" — derived from real innings state, never guessed.
  const isInningsBreak = match.status === 'live' && inningsRows.length === 1 && latestRow.status !== 'live'

  let currentInnings = null
  let target = null
  if (latestRow) {
    const matchPlayers = await matchPlayerRepo.listMatchPlayers(matchId)
    const roster = new Map(matchPlayers.map((mp) => [mp.id, { publicPlayerId: mp.public_player_id, name: mp.name }]))

    const result = await scoringService.getInningsState(latestRow.id)
    const { innings, state, format } = result

    // format.target is only ever populated for innings_number > 1 (see
    // scoring.service.js#loadFormat). During an innings break there is no
    // innings 2 row yet to compute it from — the target is still knowable
    // (innings 1's final score + 1), so it's derived here the ONE extra step
    // early, using the identical formula the engine uses everywhere else.
    target = format.target ?? (innings.innings_number === 1 && innings.status !== 'live' ? state.runs + 1 : null)

    currentInnings = buildLiveInningsState({ innings, state, format, target, roster })
  }

  return {
    match: {
      id: match.id,
      status: match.status,
      isLive: match.status === 'live' && !isInningsBreak,
      isInningsBreak,
      isCompleted: match.status === 'completed',
      isFinalized: match.status === 'finalized',
    },
    result: match.result_type ? { resultType: match.result_type, resultMargin: match.result_margin, text: match.result, winnerTeamId: match.winner_team_id } : null,
    target,
    currentInnings,
  }
}
