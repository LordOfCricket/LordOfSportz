import * as tournamentService from '../services/tournament.service.js'
import * as fixtureService from '../services/tournamentFixture.service.js'
import * as standingsService from '../services/tournamentStandings.service.js'
import * as statsService from '../services/tournamentStats.service.js'
import * as repo from '../repositories/tournament.repository.js'
import { TournamentError, TOURNAMENT_ERROR_CODES as CODES } from '../domain/tournament/errors.js'
import { formatOvers, getBallsRemaining, calculateRequiredRunRate } from '../domain/scoring/selectors.js'

// Live score for a fixture card, from the same innings CACHE columns
// buildMatchCard reads (runs/wickets/legal_balls — kept current by replay.js
// on every delivery). Returns null unless the linked match is actually
// 'live'; a finalized fixture keeps using f.match_result_* exactly as before.
function fixtureLiveScore(f) {
  if (f.match_status !== 'live' || f.i1_id == null) return null
  const bpo = f.balls_per_over || 6
  const inn = (n) =>
    f[`i${n}_id`] == null
      ? null
      : {
          inningsNumber: n,
          battingTeamId: f[`i${n}_batting_team_id`],
          runs: f[`i${n}_runs`],
          wickets: f[`i${n}_wickets`],
          oversLabel: formatOvers(f[`i${n}_legal_balls`], bpo),
        }
  const i1 = inn(1)
  const i2 = inn(2)
  let chase = null
  if (i1 && i2 && f.i2_status === 'live') {
    const target = i1.runs + 1
    const ballsRemaining = f.overs_per_innings != null ? getBallsRemaining(f.overs_per_innings, f.i2_legal_balls, bpo) : null
    chase = {
      target,
      runsNeeded: Math.max(target - i2.runs, 0),
      ballsRemaining,
      requiredRunRate: ballsRemaining != null ? calculateRequiredRunRate(target, i2.runs, ballsRemaining, bpo) : null,
    }
  }
  return { innings: [i1, i2].filter(Boolean), chase }
}

async function resolveTournamentId(publicTournamentId) {
  const tournament = await repo.findTournamentByPublicId(publicTournamentId)
  if (!tournament) throw new TournamentError(CODES.TOURNAMENT_NOT_FOUND, 'Tournament not found.')
  return tournament
}

function serializeTournament(t) {
  return {
    publicTournamentId: t.public_tournament_id,
    name: t.name,
    description: t.description,
    format: t.format,
    status: t.status,
    startDate: t.start_date,
    endDate: t.end_date,
    oversPerInnings: t.overs_per_innings,
    ballsPerOver: t.balls_per_over,
    maxTeams: t.max_teams,
    maxSquadSize: t.max_squad_size,
    championTeamId: t.champion_team_id,
    championTeamName: t.champion_team_name ?? undefined,
    teamCount: t.team_count !== undefined ? Number(t.team_count) : undefined,
    createdAt: t.created_at,
  }
}

function serializeTeam(t) {
  return { id: t.id, teamId: t.team_id, teamName: t.team_name, teamShort: t.team_short, teamLogo: t.team_logo, groupName: t.group_name }
}

function serializeSquadPlayer(s) {
  return { id: s.id, tournamentTeamId: s.tournament_team_id, playerId: s.player_id, name: s.name, publicPlayerId: s.public_player_id, role: s.role, photoUrl: s.photo_url }
}

function serializeFixture(f) {
  const awaitingResolution =
    f.match_status === 'finalized' &&
    (f.match_result_type === 'TIE' || f.match_result_type === 'NO_RESULT' || f.match_result_type == null) &&
    f.manual_result_winner_team_id == null &&
    f.stage !== 'LEAGUE' &&
    f.stage !== 'GROUP'
  return {
    id: f.id,
    stage: f.stage,
    groupName: f.group_name,
    round: f.round,
    bracketSlot: f.bracket_slot,
    fixtureNumber: f.fixture_number,
    teamA: { id: f.team_a_id, name: f.team_a_name, short: f.team_a_short, logo: f.team_a_logo },
    teamB: { id: f.team_b_id, name: f.team_b_name, short: f.team_b_short, logo: f.team_b_logo },
    matchId: f.match_id,
    matchStatus: f.match_status ?? null,
    matchDate: f.match_date ?? null,
    venue: f.venue ?? null,
    resultType: f.match_result_type ?? null,
    winnerTeamId: f.match_winner_team_id ?? null,
    resultText: f.match_result_text ?? null,
    manualResultWinnerTeamId: f.manual_result_winner_team_id ?? null,
    awaitingResolution,
    liveScore: fixtureLiveScore(f),
  }
}

export async function createTournamentHandler(req, res, next) {
  try {
    const t = await tournamentService.createTournament({ ...req.body, createdBy: req.user.id })
    res.status(201).json({ tournament: serializeTournament(t) })
  } catch (err) {
    next(err)
  }
}

export async function listTournamentsHandler(req, res, next) {
  try {
    const result = await tournamentService.listPublicTournaments({
      category: req.query.category || null,
      limit: req.query.limit !== undefined ? Number(req.query.limit) : undefined,
      offset: req.query.offset !== undefined ? Number(req.query.offset) : undefined,
    })
    res.json({ pagination: result.pagination, items: result.items.map(serializeTournament) })
  } catch (err) {
    next(err)
  }
}

export async function getTournamentHandler(req, res, next) {
  try {
    const t = await tournamentService.findTournamentByPublicId(req.params.publicTournamentId)
    res.json({ tournament: serializeTournament(t) })
  } catch (err) {
    next(err)
  }
}

export async function openRegistrationHandler(req, res, next) {
  try {
    const t = await resolveTournamentId(req.params.publicTournamentId)
    const updated = await tournamentService.openRegistration(t.id)
    res.json({ tournament: serializeTournament(updated) })
  } catch (err) {
    next(err)
  }
}

export async function registerTeamHandler(req, res, next) {
  try {
    const t = await resolveTournamentId(req.params.publicTournamentId)
    const row = await tournamentService.registerTeam(t.id, { teamId: Number(req.body.teamId), groupName: req.body.groupName || null })
    res.status(201).json({ tournamentTeam: { id: row.id, teamId: row.team_id, groupName: row.group_name } })
  } catch (err) {
    next(err)
  }
}

export async function removeTeamHandler(req, res, next) {
  try {
    const t = await resolveTournamentId(req.params.publicTournamentId)
    await tournamentService.removeTeam(t.id, Number(req.params.teamId))
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

export async function listTeamsHandler(req, res, next) {
  try {
    const t = await resolveTournamentId(req.params.publicTournamentId)
    const rows = await tournamentService.listTeams(t.id)
    res.json({ teams: rows.map(serializeTeam) })
  } catch (err) {
    next(err)
  }
}

export async function addSquadPlayerHandler(req, res, next) {
  try {
    const t = await resolveTournamentId(req.params.publicTournamentId)
    const row = await tournamentService.addSquadPlayer(t.id, { teamId: Number(req.body.teamId), playerId: Number(req.body.playerId) })
    res.status(201).json({ squadPlayer: { id: row.id, tournamentTeamId: row.tournament_team_id, playerId: row.player_id } })
  } catch (err) {
    next(err)
  }
}

export async function removeSquadPlayerHandler(req, res, next) {
  try {
    const t = await resolveTournamentId(req.params.publicTournamentId)
    await tournamentService.removeSquadPlayer(t.id, { teamId: Number(req.params.teamId), playerId: Number(req.params.playerId) })
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

export async function listSquadHandler(req, res, next) {
  try {
    const t = await resolveTournamentId(req.params.publicTournamentId)
    const rows = await tournamentService.listSquad(t.id)
    res.json({ squad: rows.map(serializeSquadPlayer) })
  } catch (err) {
    next(err)
  }
}

export async function generateFixturesHandler(req, res, next) {
  try {
    const t = await resolveTournamentId(req.params.publicTournamentId)
    const updated = await fixtureService.generateFixtures(t.id)
    res.status(201).json({ tournament: serializeTournament(updated) })
  } catch (err) {
    next(err)
  }
}

export async function listFixturesHandler(req, res, next) {
  try {
    const t = await resolveTournamentId(req.params.publicTournamentId)
    const rows = await fixtureService.listFixtures(t.id)
    res.json({ fixtures: rows.map(serializeFixture) })
  } catch (err) {
    next(err)
  }
}

export async function scheduleFixtureHandler(req, res, next) {
  try {
    await resolveTournamentId(req.params.publicTournamentId)
    const fixture = await fixtureService.scheduleFixture(Number(req.params.fixtureId), { matchDate: req.body.matchDate, venue: req.body.venue || null })
    res.json({ fixture: serializeFixture(fixture) })
  } catch (err) {
    next(err)
  }
}

export async function resolveFixtureHandler(req, res, next) {
  try {
    await resolveTournamentId(req.params.publicTournamentId)
    const fixture = await fixtureService.resolveFixtureManually(Number(req.params.fixtureId), { winnerTeamId: Number(req.body.winnerTeamId), byUserId: req.user.id })
    res.json({ fixture: serializeFixture(fixture) })
  } catch (err) {
    next(err)
  }
}

export async function completeLeagueHandler(req, res, next) {
  try {
    const t = await resolveTournamentId(req.params.publicTournamentId)
    const updated = await fixtureService.completeLeagueTournament(t.id)
    res.json({ tournament: serializeTournament(updated) })
  } catch (err) {
    next(err)
  }
}

export async function getStandingsHandler(req, res, next) {
  try {
    const t = await resolveTournamentId(req.params.publicTournamentId)
    const standings = await standingsService.getTournamentStandings(t.id)
    res.json({ standings })
  } catch (err) {
    next(err)
  }
}

export async function getStatisticsHandler(req, res, next) {
  try {
    const t = await resolveTournamentId(req.params.publicTournamentId)
    const stats = await statsService.getTournamentStatistics(t.id)
    res.json(stats)
  } catch (err) {
    next(err)
  }
}
