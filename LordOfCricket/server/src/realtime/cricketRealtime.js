// Phase 11 — cricket realtime transport. This module owns room naming, join
// validation, and authoritative state publication. It contains ZERO cricket
// rules: `publishMatchState` only re-reads the exact same lightweight DTO
// `GET /matches/:id/live-state` already builds (liveMatch.service.js — the
// same replay engine, same read model) and forwards it verbatim. No scoring
// write ever happens through a socket (Part 45) — this file is read/transport
// only, mirroring the existing canteen io.on('connection', ...) pattern in
// server.js rather than introducing a second Socket.IO server.
//
// Phase 12 adds `publishCommentary` alongside `publishMatchState` — the SAME
// match:{matchId} room (Part 75: no second room), a SEPARATE event
// (match:commentary, Part 36: never overload match:state with commentary
// history), called only AFTER commentary has already been persisted
// (Part 37).

import { findMatchById } from '../models/match.model.js'
import * as liveMatchService from '../services/liveMatch.service.js'
import { logger } from '../utils/logger.js'

export function matchRoom(matchId) {
  return `match:${matchId}`
}

/**
 * Registers the cricket join/leave handlers on the shared io instance.
 * Additive to the existing canteen `io.on('connection', ...)` registration
 * in server.js — Socket.IO fires every registered connection listener for
 * each new socket, so this never touches (or risks) canteen behavior.
 */
export function registerCricketRealtime(io) {
  io.on('connection', (socket) => {
    // Client never controls the raw room string (Part 5) — only a matchId,
    // server-validated and server-mapped to the room name.
    socket.on('join-match', async (payload) => {
      const matchId = Number(payload?.matchId)
      if (!Number.isInteger(matchId) || matchId <= 0) {
        socket.emit('match:error', { message: 'A valid matchId is required to join a match room.' })
        return
      }
      try {
        const match = await findMatchById(matchId)
        if (!match) {
          socket.emit('match:error', { message: 'Match not found.' })
          return
        }
        socket.join(matchRoom(matchId))
      } catch (err) {
        logger.error('join-match failed', { matchId, error: err.message })
        socket.emit('match:error', { message: 'Could not join match room.' })
      }
    })

    socket.on('leave-match', (payload) => {
      const matchId = Number(payload?.matchId)
      if (Number.isInteger(matchId) && matchId > 0) socket.leave(matchRoom(matchId))
    })

    // No explicit disconnect cleanup needed — Socket.IO removes a disconnected
    // socket from every room it was in automatically (Part 6). No manual
    // registry of connected spectators is kept anywhere (Part 43): the room
    // membership IS the only "who's watching" state, and it's Socket.IO's own.
  })
}

/**
 * The ONE centralized publication boundary (Part 77) — callers are
 * controllers, always invoked AFTER their service call's transaction has
 * already committed (Part 12/78), never before. `reason` is informational
 * only (Part 7) — logging/debugging value, the client must never branch
 * cricket logic on it.
 *
 * Deliberately re-reads state from PostgreSQL rather than forwarding
 * whatever the write path had in memory — the write path's `state` is a
 * replay of the log AS OF that single write, but liveMatchService.
 * getLiveMatchState re-fetches the innings row (fresh `version`) and re-
 * replays, so a burst of rapid corrections/deliveries can never publish an
 * out-of-date snapshot even if publishes overlap in-flight.
 */
export async function publishMatchState(io, matchId, reason) {
  if (!io || matchId == null) return // socket layer unavailable/no-op — must never break a scoring write (Part 79)
  try {
    const state = await liveMatchService.getLiveMatchState(matchId)
    io.to(matchRoom(matchId)).emit('match:state', { matchId: Number(matchId), reason, ...state })
  } catch (err) {
    // A publish failure must never surface to the scorer/HTTP caller — the
    // database write already committed successfully; realtime delivery is
    // best-effort (Part 78). Spectators recover via reconnect/HTTP resync.
    logger.error('Realtime publish failed', { matchId, reason, error: err.message })
  }
}

/**
 * Phase 12 — publishes a commentary CHANGE, never a full history dump
 * (Part 34/36). Caller decides the mode:
 *  - 'append': `entries` are commentary rows that were JUST persisted for
 *    the newest delivery/event (normal scoring path) — the client appends them.
 *  - 'resync': a correction/undo may have changed many entries at once;
 *    `entries` is empty and the client refetches the authoritative page over
 *    HTTP (Part 40 — safer than trying to prove only one line changed).
 * Same fire-and-forget/never-throws contract as publishMatchState: a
 * commentary broadcast failure must never surface as a scoring failure
 * (Part 38/79), and callers only invoke this AFTER commentary is already
 * durably persisted (Part 37).
 */
export function publishCommentary(io, matchId, { inningsId, inningsVersion, mode, entries = [] }) {
  if (!io || matchId == null) return
  try {
    io.to(matchRoom(matchId)).emit('match:commentary', {
      matchId: Number(matchId),
      inningsId: Number(inningsId),
      inningsVersion,
      mode,
      entries: entries.map((e) => ({
        id: e.id,
        type: e.type,
        ballLabel: e.ball_label,
        text: e.text,
        tags: e.tags,
        score: e.score_runs != null ? { runs: e.score_runs, wickets: e.score_wickets } : null,
        deliveryId: e.source_delivery_id,
        eventId: e.source_event_id,
        sequence: e.sequence,
      })),
    })
  } catch (err) {
    logger.error('Commentary publish failed', { matchId, error: err.message })
  }
}
