import * as umpireSelfService from '../services/umpireSelf.service.js'
import { getMyEarningsSummary } from '../services/umpireEarnings.service.js'
import { getUmpireInsight } from '../services/aiInsight.service.js'

export async function listAvailableMatches(req, res, next) {
  try {
    const matches = await umpireSelfService.listAvailableMatches()
    res.json({ matches })
  } catch (err) {
    next(err)
  }
}

export async function listMyAssignments(req, res, next) {
  try {
    const assignments = await umpireSelfService.listMyAssignments(req.user.id)
    res.json({ assignments })
  } catch (err) {
    next(err)
  }
}

export async function getMyProfile(req, res, next) {
  try {
    const profile = await umpireSelfService.getMyProfile(req.user.id)
    res.json({ profile })
  } catch (err) {
    next(err)
  }
}

export async function updateMyProfile(req, res, next) {
  try {
    const bio = typeof req.body?.bio === 'string' ? req.body.bio.slice(0, 500) : undefined
    const isAvailable = typeof req.body?.isAvailable === 'boolean' ? req.body.isAvailable : undefined
    const profile = await umpireSelfService.updateMyProfile(req.user.id, { bio, isAvailable })
    res.json({ profile })
  } catch (err) {
    next(err)
  }
}

export async function getMyAvailability(req, res, next) {
  try {
    const availability = await umpireSelfService.getMyAvailability(req.user.id)
    res.json(availability)
  } catch (err) {
    next(err)
  }
}

export async function updateWeeklyAvailability(req, res, next) {
  try {
    const dayOfWeek = Number(req.body?.dayOfWeek)
    const isAvailable = Boolean(req.body?.isAvailable)
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return res.status(400).json({ error: 'dayOfWeek must be an integer 0-6.' })
    }
    const rule = await umpireSelfService.setWeeklyAvailability(req.user.id, dayOfWeek, isAvailable)
    res.json({ rule })
  } catch (err) {
    next(err)
  }
}

export async function updateDateAvailability(req, res, next) {
  try {
    const specificDate = typeof req.body?.date === 'string' ? req.body.date : null
    if (!specificDate) return res.status(400).json({ error: 'date is required (YYYY-MM-DD).' })
    const isAvailable = Boolean(req.body?.isAvailable)
    const startTime = typeof req.body?.startTime === 'string' ? req.body.startTime : null
    const endTime = typeof req.body?.endTime === 'string' ? req.body.endTime : null
    const override = await umpireSelfService.setDateAvailability(req.user.id, { specificDate, startTime, endTime, isAvailable })
    res.json({ override })
  } catch (err) {
    next(err)
  }
}

// Umpire Intelligence & Scale 2.0 — self-scoped AI performance summary.
// Same "always 200 with an `available` flag" contract as the public
// match/player/team insight endpoints (never an error state for "no
// insight yet" — see aiInsight.controller.js's own comment).
export async function getMyUmpireInsight(req, res, next) {
  try {
    const result = await getUmpireInsight(req.user.id)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function regenerateMyUmpireInsight(req, res, next) {
  try {
    const result = await getUmpireInsight(req.user.id, { forceRegenerate: true })
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function getMyOfficiatingTrend(req, res, next) {
  try {
    const months = req.query.months ? Number(req.query.months) : undefined
    const trend = await umpireSelfService.getMyOfficiatingTrend(req.user.id, Number.isInteger(months) && months > 0 ? months : undefined)
    res.json(trend)
  } catch (err) {
    next(err)
  }
}

export async function getMyEarnings(req, res, next) {
  try {
    const earnings = await getMyEarningsSummary(req.user.id)
    res.json(earnings)
  } catch (err) {
    next(err)
  }
}

export async function deleteDateAvailabilityHandler(req, res, next) {
  try {
    await umpireSelfService.removeDateAvailability(req.user.id, req.params.date)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
