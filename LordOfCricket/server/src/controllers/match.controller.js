import { findAllMatchesWithTeams, findMatchByIdWithTeams } from '../models/match.model.js'
import * as matchService from '../services/match.service.js'
import * as matchSummaryService from '../services/matchSummary.service.js'
import * as publicMatchService from '../services/publicMatch.service.js'
import * as liveMatchService from '../services/liveMatch.service.js'
import * as commentaryService from '../services/commentary.service.js'
import * as umpireAssignmentService from '../services/umpireAssignment.service.js'
import * as matchIncidentService from '../services/matchIncident.service.js'
import * as matchChecklistService from '../services/matchChecklist.service.js'
import { publishMatchState } from '../realtime/cricketRealtime.js'
import * as tournamentFixtureService from '../services/tournamentFixture.service.js'
import { logger } from '../utils/logger.js'

// Phase 10 Part 1 — public match discovery (no auth, same public-read
// posture as GET /matches and GET /matches/:id/summary).
export async function getPublicMatches(req, res, next) {
  try {
    const result = await publicMatchService.listPublicMatches({
      category: req.query.category,
      limit: req.query.limit !== undefined ? Number(req.query.limit) : undefined,
      offset: req.query.offset !== undefined ? Number(req.query.offset) : undefined,
    })
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function getHomeDiscovery(req, res, next) {
  try {
    res.json(await publicMatchService.getHomeDiscovery())
  } catch (err) {
    next(err)
  }
}

export async function listMatches(req, res, next) {
  try {
    const matches = await findAllMatchesWithTeams()
    res.json(matches)
  } catch (err) {
    next(err)
  }
}

export async function getMatch(req, res, next) {
  try {
    const match = await findMatchByIdWithTeams(req.params.id)
    if (!match) return res.status(404).json({ message: 'Match not found.' })
    res.json({ match })
  } catch (err) {
    next(err)
  }
}

export async function createMatchHandler(req, res, next) {
  try {
    const match = await matchService.createMatch(req.body)
    res.status(201).json({ match })
  } catch (err) {
    next(err)
  }
}

export async function setToss(req, res, next) {
  try {
    const match = await matchService.setToss(req.params.id, req.body)
    res.json({ match })
  } catch (err) {
    next(err)
  }
}

export async function checkIn(req, res, next) {
  try {
    const latitude = req.body?.latitude != null ? Number(req.body.latitude) : undefined
    const longitude = req.body?.longitude != null ? Number(req.body.longitude) : undefined
    const slot = await umpireAssignmentService.checkIn({ matchId: Number(req.params.id), user: req.user, latitude, longitude })
    res.json({ slot })
  } catch (err) {
    next(err)
  }
}

export async function reportIncident(req, res, next) {
  try {
    const incident = await matchIncidentService.reportIncident({
      matchId: Number(req.params.id),
      user: req.user,
      incidentType: req.body?.incidentType,
      description: req.body?.description,
      occurredAt: req.body?.occurredAt,
    })
    res.status(201).json({ incident })
  } catch (err) {
    next(err)
  }
}

export async function listIncidents(req, res, next) {
  try {
    const incidents = await matchIncidentService.listIncidents(Number(req.params.id))
    res.json({ incidents })
  } catch (err) {
    next(err)
  }
}

export async function getMatchChecklist(req, res, next) {
  try {
    const items = await matchChecklistService.getChecklist(Number(req.params.id), req.user.id)
    res.json({ items })
  } catch (err) {
    next(err)
  }
}

export async function updateMatchChecklistItem(req, res, next) {
  try {
    const item = await matchChecklistService.setChecklistItem(Number(req.params.id), req.user.id, req.body?.itemKey, req.body?.isChecked)
    res.json({ item })
  } catch (err) {
    next(err)
  }
}

export async function startMatch(req, res, next) {
  try {
    const match = await matchService.startMatch(req.params.id, { confirmUnderstaffed: req.body?.confirmUnderstaffed === true })
    res.json({ match })
    // Phase 11: lets a spectator already sitting on an upcoming match's page
    // see the upcoming -> live transition immediately (Part 20 of the Phase
    // 10 readiness notes) instead of waiting for the next slow lifecycle poll.
    publishMatchState(req.io, match.id, 'lifecycle')
    // Phase 15: if this match is a tournament fixture, SCHEDULED -> LIVE the
    // moment the tournament's first ball is actually bowled (never merely
    // because a date passed). A no-op for a non-tournament match; never
    // allowed to fail the match-start response itself.
    tournamentFixtureService.onMatchStarted(match.id).catch((err) => logger.error('Tournament onMatchStarted failed', { matchId: match.id, error: err.message }))
  } catch (err) {
    next(err)
  }
}

export async function finalizeMatch(req, res, next) {
  try {
    const match = await matchService.finalizeMatch(req.params.id)
    res.json({ match })
    publishMatchState(req.io, match.id, 'lifecycle')
    // Phase 15: drives knockout progression/champion crowning for a
    // tournament-linked match. A no-op for a non-tournament match; a
    // progression error must never fail the underlying finalize response —
    // finalize is a one-way lock, so it's always safe to retry progression
    // separately later if this ever throws.
    tournamentFixtureService.onMatchFinalized(match.id).catch((err) => logger.error('Tournament onMatchFinalized failed', { matchId: match.id, error: err.message }))
  } catch (err) {
    next(err)
  }
}

// Phase 9 — public match summary/scorecard read model. No auth: consistent
// with GET /matches and GET /matches/:id's existing public-read posture.
export async function getMatchSummary(req, res, next) {
  try {
    const summary = await matchSummaryService.getMatchSummary(req.params.id)
    res.json(summary)
  } catch (err) {
    next(err)
  }
}

// Phase 10 Part 3 — lightweight spectator live-state read model, meant to be
// polled every few seconds. Public, read-only; write/scoring authorization
// is completely unchanged (see scoring.routes.js).
export async function getLiveMatchState(req, res, next) {
  try {
    const state = await liveMatchService.getLiveMatchState(req.params.id)
    res.json(state)
  } catch (err) {
    next(err)
  }
}

// Phase 12 — public, read-only commentary feed (same public-read posture as
// the summary/live-state endpoints above). `inningsId` defaults to the
// match's latest innings; `before`/`limit` paginate newest-first; `type`
// filters to one COMMENTARY_TYPES value.
export async function getMatchCommentary(req, res, next) {
  try {
    const page = await commentaryService.getCommentaryPage({
      matchId: req.params.id,
      inningsId: req.query.inningsId,
      before: req.query.before,
      limit: req.query.limit,
      type: req.query.type,
    })
    if (!page) return res.status(404).json({ message: 'No commentary available for this match.' })
    res.json(page)
  } catch (err) {
    next(err)
  }
}
