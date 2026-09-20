// Phase 7 — official career statistics. Deliberately has NO cache table and
// NO per-delivery counter increments: every call re-derives totals from
// PostgreSQL's authoritative finalized-match history (deliveries, wickets,
// match_players, matches), the same way scoring.service.js#getInningsState
// already reconstructs live innings state from nothing but the database. That
// is what makes a correction to a finalized-adjacent match, or a fresh
// finalization, show up automatically with no manual "update player stats"
// step anywhere in this codebase.
import { findPlayerById } from '../models/player.model.js'
import * as statsRepo from '../repositories/statistics.repository.js'
import * as scoringService from './scoring.service.js'
import { extractBattingPerformance, aggregateBatting, battingStrikeRate } from '../domain/statistics/battingStats.js'
import { extractBowlingPerformance, aggregateBowling, bowlingEconomy } from '../domain/statistics/bowlingStats.js'
import { aggregateFielding } from '../domain/statistics/fieldingStats.js'
import { LEADERBOARD_METRICS, isValidMetric } from '../domain/statistics/leaderboardConfig.js'
import { CRICKET_RECORD_LIMIT, buildCricketRecords } from '../domain/statistics/matchRecords.js'
import { rankPlayers } from '../domain/statistics/ranking.js'
import { buildTeamRecord } from '../domain/team/teamRecord.js'
import { computeCareerAchievements } from '../domain/statistics/careerMilestones.js'
import { buildCareerTimeline } from '../domain/statistics/careerTimeline.js'

const MAX_MATCH_HISTORY_LIMIT = 50
const DEFAULT_RECENT_FORM_COUNT = 5
const MAX_LEADERBOARD_LIMIT = 50
const DEFAULT_LEADERBOARD_LIMIT = 10
const MAX_SEARCH_LIMIT = 50
const DEFAULT_SEARCH_LIMIT = 20

function notFound(message) {
  const err = new Error(message)
  err.statusCode = 404
  return err
}

function opponentFor(participationRow) {
  return participationRow.team_id === participationRow.team_a_id ? participationRow.team_b_name : participationRow.team_a_name
}

function wonFor(participationRow) {
  if (participationRow.result_type === 'TIE') return null
  if (participationRow.winner_team_id == null) return null
  return participationRow.winner_team_id === participationRow.team_id
}

/**
 * Groups this player's finalized-match participation by the team they
 * represented in EACH match (match_players.team_id — an immutable per-match
 * snapshot; a later roster transfer never rewrites it, see
 * teamRoster.service.js's own comment on why team_id assignment is "one team
 * at a time... never a separate join table"). This is genuine historical
 * team participation derived from real match records, NOT a membership
 * table (none exists) — a player legitimately appears here for more than
 * one team only if they've actually played finalized matches for more than
 * one. Reuses teamRecord.js#buildTeamRecord (the same function a team's own
 * public profile record uses) so the per-team win/loss/tie numbers here are
 * computed identically, just grouped from the player's side instead of the
 * team's side. Sorted most-recently-played-for first.
 */
function buildTeamHistory(participation) {
  const rowsByTeam = new Map()
  for (const p of participation) {
    if (!rowsByTeam.has(p.team_id)) rowsByTeam.set(p.team_id, [])
    rowsByTeam.get(p.team_id).push(p)
  }

  const history = []
  for (const [teamId, rows] of rowsByTeam) {
    const first = rows[0]
    const isTeamA = teamId === first.team_a_id
    const sortedNewestFirst = rows.slice().sort((a, b) => new Date(b.match_date) - new Date(a.match_date))
    history.push({
      teamId,
      name: isTeamA ? first.team_a_name : first.team_b_name,
      shortName: isTeamA ? first.team_a_short : first.team_b_short,
      logoUrl: isTeamA ? first.team_a_logo : first.team_b_logo,
      record: buildTeamRecord(rows, teamId),
      firstMatchDate: sortedNewestFirst[sortedNewestFirst.length - 1].match_date,
      lastMatchDate: sortedNewestFirst[0].match_date,
    })
  }

  history.sort((a, b) => new Date(b.lastMatchDate) - new Date(a.lastMatchDate))
  return history
}

/**
 * Builds one PlayerMatchPerformance per finalized match this player appeared
 * in. Replays every innings of every one of those matches exactly once
 * (reusing scoring.service.js#getInningsState — the identical function the
 * live scorer and Edit Score both already trust) and pulls this player's own
 * match_player_id out of state.batsmen/state.bowlers. DNB and did-not-bowl
 * are preserved as `didBat: false` / `didBowl: false`, never collapsed into a
 * zero-run or zero-wicket performance.
 */
async function buildMatchPerformances(participation, inningsByMatch) {
  const performances = []
  const battingPerfs = []
  const bowlingPerfs = []

  for (const p of participation) {
    const innings = inningsByMatch.get(p.match_id) || []
    let batting = { didBat: false }
    let bowling = { didBowl: false }

    for (const inn of innings) {
      const result = await scoringService.getInningsState(inn.id)
      if (!result) continue
      const { state, format } = result

      const battingPerf = extractBattingPerformance(state, p.match_player_id)
      if (battingPerf) {
        battingPerfs.push(battingPerf)
        batting = { didBat: true, ...battingPerf, strikeRate: battingStrikeRate(battingPerf.runs, battingPerf.balls) }
      }

      const bowlingPerf = extractBowlingPerformance(state, p.match_player_id, format.ballsPerOver)
      if (bowlingPerf) {
        bowlingPerfs.push(bowlingPerf)
        bowling = { didBowl: true, ...bowlingPerf, economy: bowlingEconomy(bowlingPerf.runs, bowlingPerf.legalBalls, bowlingPerf.ballsPerOver) }
      }
    }

    performances.push({
      matchId: p.match_id,
      date: p.match_date,
      venue: p.venue,
      // Immutable per-match team snapshot (match_players.team_id) — the same
      // source buildTeamHistory uses; never the player's CURRENT team.
      teamId: p.team_id,
      opponent: opponentFor(p),
      result: p.result,
      won: wonFor(p),
      batting,
      bowling,
    })
  }

  performances.sort((a, b) => new Date(b.date) - new Date(a.date) || b.matchId - a.matchId)
  return { performances, battingPerfs, bowlingPerfs }
}

export async function getPlayerCareerStats(playerId, { matchHistoryLimit = 10, matchHistoryOffset = 0 } = {}) {
  const player = await findPlayerById(playerId)
  if (!player) throw notFound('Player not found.')

  const limit = Math.max(0, Math.min(matchHistoryLimit, MAX_MATCH_HISTORY_LIMIT))
  const offset = Math.max(0, matchHistoryOffset)

  const participation = await statsRepo.listFinalizedMatchParticipation(playerId)
  const matchIds = [...new Set(participation.map((p) => p.match_id))]
  const matchPlayerIds = participation.map((p) => p.match_player_id)

  const inningsRows = await statsRepo.listInningsForMatches(matchIds)
  const inningsByMatch = new Map()
  for (const row of inningsRows) {
    if (!inningsByMatch.has(row.match_id)) inningsByMatch.set(row.match_id, [])
    inningsByMatch.get(row.match_id).push(row)
  }

  const { performances, battingPerfs, bowlingPerfs } = await buildMatchPerformances(participation, inningsByMatch)
  const fieldingWicketRows = await statsRepo.listFieldingWicketsForPlayers(matchPlayerIds)
  const fielding = aggregateFielding(fieldingWicketRows, new Set(matchPlayerIds))

  const career = {
    matches: participation.length,
    batting: aggregateBatting(battingPerfs),
    bowling: aggregateBowling(bowlingPerfs),
    fielding,
  }

  const teamHistory = buildTeamHistory(participation)
  // `performances` is newest-first; achievements/timeline both need it
  // oldest-first (cumulative milestone crossing, chronological year buckets).
  const chronoPerformances = performances.slice().reverse()
  const achievements = computeCareerAchievements({ career, chronoPerformances })
  const careerTimeline = buildCareerTimeline({ chronoPerformances, teamHistory, earnedAchievements: achievements.earned })

  return {
    player: { id: player.id, publicPlayerId: player.public_player_id, name: player.name, role: player.role },
    career,
    recentForm: performances.slice(0, DEFAULT_RECENT_FORM_COUNT),
    matchHistory: {
      total: performances.length,
      limit,
      offset,
      items: performances.slice(offset, offset + limit),
    },
    personalBests: {
      highestScore: career.batting.highestScore,
      bestBowling: career.bowling.bestBowling,
    },
    // Real per-team history derived from match_players — see buildTeamHistory's
    // own comment. Independent of players.team_id (the current-roster FK);
    // a player who has only ever played for their current team will simply
    // have exactly one entry here.
    teamHistory,
    // Deterministic career milestones + a year-by-year timeline, both derived
    // from the same finalized-match history above (no cache, no fabricated
    // dates — see the two domain modules). Public-safe: only match ids/dates,
    // opponent team names and this player's own team names/logos, all of
    // which already appear in matchHistory/teamHistory.
    achievements,
    careerTimeline,
  }
}

/**
 * Phase 8 — the ranking engine's data source. Filters candidates at the SQL
 * layer FIRST (role/team — Part 31's "current team" semantics), then replays
 * each remaining candidate's finalized career exactly once (same
 * getPlayerCareerStats every other Phase 7 consumer uses — one definition of
 * "official", never a second). Qualification, sorting, and rank assignment
 * all happen in the pure domain layer (leaderboardConfig.js/ranking.js) —
 * this function only fetches and hands off.
 */
export async function getLeaderboard(metric, { limit = DEFAULT_LEADERBOARD_LIMIT, offset = 0, role = null, teamId = null } = {}) {
  if (!isValidMetric(metric)) {
    const err = new Error(`Unknown leaderboard metric '${metric}'. Supported: ${Object.keys(LEADERBOARD_METRICS).join(', ')}`)
    err.statusCode = 400
    throw err
  }
  const metricConfig = LEADERBOARD_METRICS[metric]
  const clampedLimit = Math.max(1, Math.min(limit, MAX_LEADERBOARD_LIMIT))
  const clampedOffset = Math.max(0, offset)

  const playerIds = await statsRepo.listCandidatePlayersWithFinalizedMatches({ role, teamId })
  const entries = []
  for (const playerId of playerIds) {
    // Defensive: the candidate list and this replay are two separate reads —
    // if the player row was removed in between (never happens through any
    // exposed LOC feature today, but nothing guarantees it never will), skip
    // that one candidate rather than failing the whole leaderboard.
    let stats
    try {
      stats = await getPlayerCareerStats(playerId, { matchHistoryLimit: 0 })
    } catch (err) {
      if (err.statusCode === 404) continue
      throw err
    }
    entries.push({ player: stats.player, career: stats.career })
  }

  const { total, items } = rankPlayers(entries, metricConfig, { limit: clampedLimit, offset: clampedOffset })

  return {
    metric,
    title: metricConfig.title,
    category: metricConfig.category,
    unit: metricConfig.unit,
    direction: metricConfig.category === 'bowling' && (metric === 'bowling-average' || metric === 'economy') ? 'asc' : 'desc',
    qualification: metricConfig.qualification || null,
    pagination: { limit: clampedLimit, offset: clampedOffset, total },
    items: items.map((item) => ({
      rank: item.rank,
      player: item.player,
      value: metricConfig.value(item.career),
      secondary: metricConfig.secondary(item.career),
    })),
  }
}

/**
 * Priority 3 — LOC Cricket Records. Match & team records across ALL finalized
 * matches, the team/match-side counterpart to the per-player career
 * leaderboards above. Every figure is an authoritative innings.runs /
 * matches.result_margin column value (five cheap SQL aggregates, no replay,
 * no N+1 — see statistics.repository.js#getCricketRecordRows); this service
 * only maps snake_case rows to a public-safe DTO (team id/name/shortName,
 * matchId, matchDate, runs/wickets/margin — never a private field). Empty
 * arrays when no finalized match qualifies; the client shows an honest empty
 * state, nothing is fabricated. "Best individual batting/bowling performance"
 * is deliberately NOT duplicated here — it is already the #1 row of the
 * existing `highest-score` / `best-bowling` leaderboards.
 */
export async function getCricketRecords() {
  const rows = await statsRepo.getCricketRecordRows(CRICKET_RECORD_LIMIT)
  return buildCricketRecords(rows)
}

/**
 * Public player discovery/search. Only ever reads public-safe columns (see
 * statistics.repository.js#searchPlayers) — no email/phone/user_id ever
 * enters this path. Bounded batch: a full career replay only happens for the
 * `limit` players actually being returned on THIS page, never the whole
 * roster (Part 30).
 */
export async function searchPlayers({ q = null, role = null, teamId = null, limit = DEFAULT_SEARCH_LIMIT, offset = 0 } = {}) {
  const clampedLimit = Math.max(1, Math.min(limit, MAX_SEARCH_LIMIT))
  const clampedOffset = Math.max(0, offset)
  const { rows, total } = await statsRepo.searchPlayers({ q, role, teamId, limit: clampedLimit, offset: clampedOffset })

  const items = []
  for (const row of rows) {
    const stats = await getPlayerCareerStats(row.id, { matchHistoryLimit: 0 })
    items.push({
      player: {
        publicPlayerId: row.public_player_id,
        name: row.name,
        role: row.role,
        photoUrl: row.photo_url,
        battingStyle: row.batting_style,
        bowlingStyle: row.bowling_style,
        team: row.team_id != null ? { id: row.team_id, name: row.team_name, shortName: row.team_short, logoUrl: row.team_logo } : null,
      },
      career: {
        matches: stats.career.matches,
        batting: { runs: stats.career.batting.runs, average: stats.career.batting.average, strikeRate: stats.career.batting.strikeRate },
        bowling: {
          wickets: stats.career.bowling.wickets,
          average: stats.career.bowling.average,
          economy: stats.career.bowling.economy,
          bestBowling: stats.career.bowling.bestBowling,
        },
      },
    })
  }

  return { pagination: { limit: clampedLimit, offset: clampedOffset, total }, items }
}

/**
 * Public cricket profile header — deliberately a NARROW projection.
 * Never includes email/phone/user_id/canteen data (Part 7/44); the private
 * self-profile (GET /me/player) is a completely separate endpoint and stays
 * that way.
 */
export async function getPublicPlayerProfile(publicPlayerId) {
  const row = await statsRepo.findPublicPlayerByPublicId(publicPlayerId)
  if (!row) throw notFound('Player not found.')
  return {
    publicPlayerId: row.public_player_id,
    name: row.name,
    role: row.role,
    battingStyle: row.batting_style,
    bowlingStyle: row.bowling_style,
    jerseyNumber: row.jersey_number,
    photoUrl: row.photo_url,
    city: row.city,
    bio: row.bio,
    team: row.team_id != null ? { id: row.team_id, name: row.team_name, shortName: row.team_short, logoUrl: row.team_logo } : null,
  }
}
