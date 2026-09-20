import * as aiInsightService from '../services/aiInsight.service.js'

// Phase 16 Part 30 — every response is 200 with an `available` flag, even
// when there's no insight yet (NOT_CONFIGURED/INSUFFICIENT_DATA/PROVIDER_ERROR/
// INVALID_OUTPUT/DECLINED) — the existing Match Summary/Player/Team Profile
// page must never treat "no AI insight" as an error state (Part 25/38).
// A 404 only ever means the underlying match/player/team itself doesn't
// exist — propagated by next(err) exactly like every other public read in
// this app.

export async function getMatchInsight(req, res, next) {
  try {
    const result = await aiInsightService.getMatchInsight(req.params.id)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function getPlayerInsight(req, res, next) {
  try {
    const result = await aiInsightService.getPlayerInsight(req.params.publicPlayerId)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function getTeamInsight(req, res, next) {
  try {
    const result = await aiInsightService.getTeamInsight(req.params.id)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

// Part 31 — staff-only, never a normal spectator control.
export async function regenerateMatchInsight(req, res, next) {
  try {
    const result = await aiInsightService.getMatchInsight(req.params.id, { forceRegenerate: true })
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function regeneratePlayerInsight(req, res, next) {
  try {
    const result = await aiInsightService.getPlayerInsight(req.params.publicPlayerId, { forceRegenerate: true })
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function regenerateTeamInsight(req, res, next) {
  try {
    const result = await aiInsightService.getTeamInsight(req.params.id, { forceRegenerate: true })
    res.json(result)
  } catch (err) {
    next(err)
  }
}
