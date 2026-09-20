import * as availabilityService from '../services/matchAvailability.service.js'

export async function getMyAvailability(req, res, next) {
  try {
    res.json(await availabilityService.getMyAvailability(req.user.id, req.params.matchId))
  } catch (err) {
    next(err)
  }
}

export async function setMyAvailability(req, res, next) {
  try {
    res.json(await availabilityService.setMyAvailability(req.user.id, req.params.matchId, req.body.status))
  } catch (err) {
    next(err)
  }
}

// Phase 14 Part 1 (3) — organizer/staff read access, same authorization tier
// as building the roster (requireScorer). Informational only: nothing here
// ever writes to match_players.
export async function listMatchAvailability(req, res, next) {
  try {
    res.json({ players: await availabilityService.listMatchAvailability(req.params.matchId) })
  } catch (err) {
    next(err)
  }
}
