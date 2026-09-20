import { parseCoordinate, parseRadiusKm, parsePagination, roundDistance } from './ground.controller.js'
import { findNearbyGroundsForUmpire, findGroundsByCityForUmpire, findAllGroundsForUmpire } from '../services/umpireGroundDiscovery.service.js'

const MAX_CITY_LENGTH = 100

function serializeMatchSlotRow(m) {
  return {
    matchId: m.id,
    matchDate: m.match_date,
    venue: m.venue,
    teamAName: m.team_a_name,
    teamAShort: m.team_a_short,
    teamBName: m.team_b_name,
    teamBShort: m.team_b_short,
    requiredUmpires: m.required_umpires,
    // Workstream E — match format, when the match actually has one set
    // (oversPerInnings is nullable — "no overs limit" is a real, existing
    // state, never fabricated into a default).
    oversPerInnings: m.overs_per_innings ?? null,
    ballsPerOver: m.balls_per_over ?? null,
    totalSlots: m.total_slots,
    filledSlots: m.filled_slots,
    currentUserAssigned: m.current_user_assigned,
    hasScheduleConflict: Boolean(m.has_schedule_conflict),
  }
}

function serializeGroundWithMatches(row) {
  return {
    publicGroundId: row.public_ground_id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    state: row.state,
    country: row.country,
    photos: row.photos || [],
    amenities: row.amenity_names || [],
    ...(typeof row.distance_km === 'number' ? { distanceKm: roundDistance(row.distance_km) } : {}),
    matches: (row.matches || []).map(serializeMatchSlotRow),
  }
}

export async function listNearbyGroundsForUmpire(req, res, next) {
  try {
    const lat = parseCoordinate(req.query.lat, -90, 90)
    if (lat.error) return res.status(400).json({ error: 'lat must be a number between -90 and 90.' })
    const lng = parseCoordinate(req.query.lng, -180, 180)
    if (lng.error) return res.status(400).json({ error: 'lng must be a number between -180 and 180.' })
    const radius = parseRadiusKm(req.query.radiusKm)
    if (radius.error) return res.status(400).json({ error: 'radiusKm must be a positive number.' })

    const { limit, page, offset } = parsePagination(req.query)

    const { grounds, total, anyGroundsExist } = await findNearbyGroundsForUmpire({
      latitude: lat.value,
      longitude: lng.value,
      radiusKm: radius.value,
      limit,
      offset,
      userId: req.user.id,
    })

    res.json({
      grounds: grounds.map(serializeGroundWithMatches),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      anyGroundsExist,
    })
  } catch (err) {
    next(err)
  }
}

// "Grounds for Umpire" default view — no city/coordinates required. Same
// response shape as the other two so the frontend can treat all three
// modes identically.
export async function listAllGroundsForUmpire(req, res, next) {
  try {
    const { limit, page, offset } = parsePagination(req.query)

    const { grounds, total, anyGroundsExist } = await findAllGroundsForUmpire({ limit, offset, userId: req.user.id })

    res.json({
      grounds: grounds.map(serializeGroundWithMatches),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      anyGroundsExist,
    })
  } catch (err) {
    next(err)
  }
}

export async function listGroundsByCityForUmpire(req, res, next) {
  try {
    const city = typeof req.query.city === 'string' ? req.query.city.trim() : ''
    if (!city) return res.status(400).json({ error: 'city is required.' })
    if (city.length > MAX_CITY_LENGTH) return res.status(400).json({ error: `city must be ${MAX_CITY_LENGTH} characters or fewer.` })

    const { limit, page, offset } = parsePagination(req.query)

    const { grounds, total, anyGroundsExist } = await findGroundsByCityForUmpire({
      city,
      limit,
      offset,
      userId: req.user.id,
    })

    res.json({
      grounds: grounds.map(serializeGroundWithMatches),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      anyGroundsExist,
    })
  } catch (err) {
    next(err)
  }
}
