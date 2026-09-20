import { getCache, setCache } from '../utils/cache.js'
import { logger } from '../utils/logger.js'

const CRICAPI_BASE = 'https://api.cricapi.com/v1'
const CACHE_KEY = 'india-featured-match'
const CACHE_TTL_SECONDS = 60

async function fetchCricApi(path) {
  if (!process.env.CRICAPI_KEY) {
    throw new Error('CRICAPI_KEY is not configured')
  }

  const separator = path.includes('?') ? '&' : '?'
  const res = await fetch(`${CRICAPI_BASE}${path}${separator}apikey=${process.env.CRICAPI_KEY}`)
  if (!res.ok) {
    throw new Error(`CricAPI request failed with status ${res.status}`)
  }

  const json = await res.json()
  if (json.status !== 'success') {
    throw new Error(json.status || 'CricAPI returned an error')
  }
  return json.data || []
}

function involvesIndia(match) {
  return Array.isArray(match.teams) && match.teams.some((team) => team.toLowerCase() === 'india')
}

function extractTeamScore(match, teamName) {
  if (!Array.isArray(match.score)) return null
  const innings = match.score.filter((entry) => entry.inning?.startsWith(teamName))
  if (innings.length === 0) return null
  const latest = innings[innings.length - 1]
  return { runs: latest.r ?? null, wickets: latest.w ?? null, overs: latest.o ?? null }
}

function normalizeMatch(match) {
  const [teamAName, teamBName] = match.teams || []
  const teamAInfo = match.teamInfo?.find((team) => team.name === teamAName)
  const teamBInfo = match.teamInfo?.find((team) => team.name === teamBName)
  const teamAScore = extractTeamScore(match, teamAName)
  const teamBScore = extractTeamScore(match, teamBName)

  return {
    isLive: Boolean(match.matchStarted) && !match.matchEnded,
    status: match.status,
    matchType: match.matchType,
    venue: match.venue,
    dateTimeGMT: match.dateTimeGMT,
    teamA: {
      name: teamAName,
      shortName: teamAInfo?.shortname || teamAName,
      logoUrl: teamAInfo?.img || null,
      runs: teamAScore?.runs ?? null,
      wickets: teamAScore?.wickets ?? null,
      overs: teamAScore?.overs ?? null,
    },
    teamB: {
      name: teamBName,
      shortName: teamBInfo?.shortname || teamBName,
      logoUrl: teamBInfo?.img || null,
      runs: teamBScore?.runs ?? null,
      wickets: teamBScore?.wickets ?? null,
      overs: teamBScore?.overs ?? null,
    },
  }
}

async function loadIndiaFeaturedMatch() {
  const currentMatches = await fetchCricApi('/currentMatches?offset=0')
  const liveIndiaMatch = currentMatches.find(
    (match) => involvesIndia(match) && match.matchStarted && !match.matchEnded
  )
  if (liveIndiaMatch) return normalizeMatch(liveIndiaMatch)

  const schedule = await fetchCricApi('/matches?offset=0')
  const upcomingIndiaMatches = schedule
    .filter((match) => involvesIndia(match) && !match.matchStarted && match.dateTimeGMT)
    .sort((a, b) => new Date(a.dateTimeGMT) - new Date(b.dateTimeGMT))

  return upcomingIndiaMatches[0] ? normalizeMatch(upcomingIndiaMatches[0]) : null
}

// Pre-Phase-11 cleanup: this widget shows a genuinely external, unofficial
// data source (a different competition's live score, nothing to do with
// LOC's own cricket truth) — an unset CRICAPI_KEY or a CricAPI outage is an
// EXPECTED degraded state, not a LOC server bug, and must never surface as a
// 500 (Part 94). The frontend already renders "No India international match
// info available right now" for both `null` and a failed request identically,
// so failing soft here removes a long-standing noisy console error with zero
// visible behavior change.
export async function getIndiaFeaturedMatch() {
  const cached = getCache(CACHE_KEY)
  if (cached !== undefined) return cached

  let result = null
  try {
    result = await loadIndiaFeaturedMatch()
  } catch (err) {
    logger.warn('India featured match unavailable (external CricAPI)', { error: err.message })
  }
  setCache(CACHE_KEY, result, CACHE_TTL_SECONDS)
  return result
}
