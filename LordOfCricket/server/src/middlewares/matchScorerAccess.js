// Phase 21 (U3, revised in U3.1) — match-scoped scorer authorization,
// additive alongside requireScorer (auth.js) and requireGroundRole
// (groundAccess.js). Must run after requireAuth (needs req.user).
//
// Two gates, checked in order (never the reverse — an unapproved umpire must
// never learn whether a match exists, its status, etc. before failing
// Gate 1):
//   Gate 1 (U2, reused as-is): super admin, OR an approved umpire.
//   Gate 2 (new): the approved umpire must hold an ACTIVE ('ASSIGNED') slot
//   on the SPECIFIC match this request targets, AND the match's status must
//   be one this route accepts (allowedStatuses).
// Super admin bypasses BOTH gates entirely and unconditionally, exactly as
// requireScorer already does today — this file adds nothing to that path;
// existing super-admin behavior is untouched.
//
// U3.1 correction: the default window is ['upcoming', 'live'] ONLY —
// umpire scoring authority is revoked the moment a match becomes
// 'completed', not just once it's 'finalized' (product rule: LIVE -> can
// score, COMPLETED -> revoked, FINALIZED -> stays revoked). The one
// deliberate exception is POST /matches/:id/finalize itself, which passes
// { allowedStatuses: [...DEFAULT, 'completed'] } — investigation (U3.1
// report) confirmed the real production frontend (MatchRosterPage's "Review
// / Finalize" button) already expects the SAME scorer/umpire who ran the
// match to finalize it themselves once it's completed; blocking that would
// invent a new admin-handoff workflow nobody asked for. Every other
// match-scoped route (deliveries, events, corrections, roster, toss, start,
// availability) uses the strict default — corrections in particular are
// NOT exempted, since the real scorer UI (RealScorerPage) only ever shows
// the correction editor while live and redirects away once the match
// completes, so no real workflow depends on umpire-initiated corrections
// post-completion.
import { isSuperAdminUser } from './auth.js'
import { isApprovedUmpireUser } from '../models/umpireRequest.model.js'
import { findMatchById } from '../models/match.model.js'
import { findInningsById } from '../repositories/innings.repository.js'
import { hasHeldSlotAssignment } from '../models/matchUmpireSlot.model.js'

const DEFAULT_ALLOWED_STATUSES = ['upcoming', 'live']

// resolveMatchId(req) -> Promise<matchId|null>. null means "could not be
// resolved" (bad/missing param, or the referenced innings doesn't exist) and
// always denies with 404, never with a guess.
function requireMatchScorer(resolveMatchId, { allowedStatuses = DEFAULT_ALLOWED_STATUSES } = {}) {
  return async (req, res, next) => {
    try {
      if (isSuperAdminUser(req.user)) return next()

      if (!(await isApprovedUmpireUser(req.user))) {
        return res.status(403).json({ error: 'Scorer or staff access required.' })
      }

      const matchId = await resolveMatchId(req)
      if (matchId == null) {
        return res.status(404).json({ error: 'Match not found.' })
      }

      const match = await findMatchById(matchId)
      if (!match) {
        return res.status(404).json({ error: 'Match not found.' })
      }

      // Phase 23: also true once COMPLETED (officiating credit), not just
      // ASSIGNED — see hasHeldSlotAssignment's own comment. The
      // allowedStatuses check right below is still what actually revokes
      // access for every route except finalize's deliberate exception.
      const assigned = await hasHeldSlotAssignment(match.id, req.user.id)
      if (!assigned) {
        return res.status(403).json({ error: 'You are not assigned to umpire this match.' })
      }

      // Checked AFTER assignment (not instead of it) — an umpire who was
      // never assigned gets "not assigned", not "match no longer live".
      if (!allowedStatuses.includes(match.status)) {
        return res.status(403).json({ error: 'This match is no longer live; your umpire scoring access has ended.' })
      }

      req.match = match
      next()
    } catch (err) {
      next(err)
    }
  }
}

// For routes shaped /matches/:paramName(...) — the match id is directly in
// the URL.
export function requireMatchScorerByParam(paramName = 'id', options) {
  return requireMatchScorer((req) => {
    const id = Number(req.params[paramName])
    return Number.isInteger(id) ? id : null
  }, options)
}

// For routes shaped /innings/:paramName(...) — the match id must be resolved
// through the innings row first (innings carries its own match_id; the
// client never supplies one directly for these routes).
export function requireMatchScorerByInnings(paramName = 'inningsId', options) {
  return requireMatchScorer(async (req) => {
    const innings = await findInningsById(req.params[paramName])
    return innings ? innings.match_id : null
  }, options)
}
