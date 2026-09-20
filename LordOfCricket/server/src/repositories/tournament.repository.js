import { pool } from '../config/db.js'

// ---------------------------------------------------------------------------
// Tournaments
// ---------------------------------------------------------------------------

export async function insertTournament(client, { publicTournamentId, name, description, format, startDate, endDate, oversPerInnings, ballsPerOver, maxTeams, maxSquadSize, createdBy }) {
  const { rows } = await client.query(
    `INSERT INTO tournaments (public_tournament_id, name, description, format, start_date, end_date, overs_per_innings, balls_per_over, max_teams, max_squad_size, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [publicTournamentId, name, description, format, startDate, endDate, oversPerInnings, ballsPerOver, maxTeams, maxSquadSize, createdBy]
  )
  return rows[0]
}

export async function findTournamentById(id, client = pool) {
  const { rows } = await client.query('SELECT * FROM tournaments WHERE id = $1', [id])
  return rows[0] || null
}

// Joins the champion's team name/short name (Part 38 — the public tournament
// page's Champion badge needs a display name, not just championTeamId).
// LEFT JOIN so a non-completed tournament (champion_team_id NULL) still
// returns cleanly with those columns null.
export async function findTournamentByPublicId(publicTournamentId, client = pool) {
  const { rows } = await client.query(
    `SELECT t.*, tc.name AS champion_team_name, tc.short_name AS champion_team_short
     FROM tournaments t
     LEFT JOIN teams tc ON tc.id = t.champion_team_id
     WHERE t.public_tournament_id = $1`,
    [publicTournamentId]
  )
  return rows[0] || null
}

/** Locks the tournament row for the duration of a lifecycle-changing
 * transaction (fixture generation, completion) — the concurrency boundary
 * Part 60 asks for: two simultaneous "generate fixtures" or "complete
 * tournament" requests serialize on this lock instead of racing. */
export async function lockTournamentForUpdate(client, id) {
  const { rows } = await client.query('SELECT * FROM tournaments WHERE id = $1 FOR UPDATE', [id])
  return rows[0] || null
}

export async function updateTournament(id, fields, client = pool) {
  const keys = Object.keys(fields)
  if (keys.length === 0) return findTournamentById(id, client)
  const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ')
  const { rows } = await client.query(`UPDATE tournaments SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`, [id, ...keys.map((k) => fields[k])])
  return rows[0] || null
}

const DISCOVERY_STATUS_GROUPS = {
  LIVE: ['LIVE'],
  UPCOMING: ['DRAFT', 'REGISTRATION', 'SCHEDULED'],
  COMPLETED: ['COMPLETED'],
}

export async function listPublicTournaments({ category = null, limit = 20, offset = 0 } = {}) {
  const statuses = category ? DISCOVERY_STATUS_GROUPS[category] : null
  const { rows } = await pool.query(
    `SELECT t.*, tc.name AS champion_team_name, tc.short_name AS champion_team_short,
            (SELECT COUNT(*) FROM tournament_teams tt WHERE tt.tournament_id = t.id) AS team_count,
            COUNT(*) OVER()::int AS total_count
     FROM tournaments t
     LEFT JOIN teams tc ON tc.id = t.champion_team_id
     WHERE ($1::text[] IS NULL OR t.status = ANY($1))
     ORDER BY t.start_date DESC, t.id DESC
     LIMIT $2 OFFSET $3`,
    [statuses, limit, offset]
  )
  return { rows, total: rows[0]?.total_count ?? 0 }
}

// ---------------------------------------------------------------------------
// Tournament teams
// ---------------------------------------------------------------------------

export async function insertTournamentTeam(client, { tournamentId, teamId, groupName = null }) {
  const { rows } = await client.query(
    `INSERT INTO tournament_teams (tournament_id, team_id, group_name) VALUES ($1,$2,$3) RETURNING *`,
    [tournamentId, teamId, groupName]
  )
  return rows[0]
}

export async function listTournamentTeams(tournamentId, client = pool) {
  const { rows } = await client.query(
    `SELECT tt.id, tt.tournament_id, tt.team_id, tt.group_name, tt.registered_at,
            t.name AS team_name, t.short_name AS team_short, t.logo_url AS team_logo
     FROM tournament_teams tt
     JOIN teams t ON t.id = tt.team_id
     WHERE tt.tournament_id = $1
     ORDER BY tt.id ASC`,
    [tournamentId]
  )
  return rows
}

export async function findTournamentTeam(tournamentId, teamId, client = pool) {
  const { rows } = await client.query('SELECT * FROM tournament_teams WHERE tournament_id = $1 AND team_id = $2', [tournamentId, teamId])
  return rows[0] || null
}

export async function findTournamentTeamById(tournamentTeamId, client = pool) {
  const { rows } = await client.query('SELECT * FROM tournament_teams WHERE id = $1', [tournamentTeamId])
  return rows[0] || null
}

export async function updateTournamentTeamGroup(id, groupName, client = pool) {
  const { rows } = await client.query('UPDATE tournament_teams SET group_name = $2 WHERE id = $1 RETURNING *', [id, groupName])
  return rows[0] || null
}

export async function removeTournamentTeam(tournamentId, teamId, client = pool) {
  await client.query('DELETE FROM tournament_teams WHERE tournament_id = $1 AND team_id = $2', [tournamentId, teamId])
}

// ---------------------------------------------------------------------------
// Tournament squads (historical snapshot — see schema.sql's Phase 15 comment)
// ---------------------------------------------------------------------------

export async function insertSquadPlayer(client, { tournamentId, tournamentTeamId, playerId }) {
  const { rows } = await client.query(
    `INSERT INTO tournament_squad_players (tournament_id, tournament_team_id, player_id) VALUES ($1,$2,$3) RETURNING *`,
    [tournamentId, tournamentTeamId, playerId]
  )
  return rows[0]
}

/** Every squad player in the tournament, joined to their CURRENT player
 * identity (name/public id/photo) but grouped by tournament_team_id — the
 * HISTORICAL team they represented, never players.team_id (Part 9/78). */
export async function listSquadPlayers(tournamentId, client = pool) {
  const { rows } = await client.query(
    `SELECT sp.id, sp.tournament_team_id, sp.player_id, sp.added_at,
            p.name, p.public_player_id, p.role, p.photo_url
     FROM tournament_squad_players sp
     JOIN players p ON p.id = sp.player_id
     WHERE sp.tournament_id = $1
     ORDER BY sp.id ASC`,
    [tournamentId]
  )
  return rows
}

export async function countSquadPlayers(tournamentTeamId, client = pool) {
  const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM tournament_squad_players WHERE tournament_team_id = $1', [tournamentTeamId])
  return rows[0].count
}

/** Used to enforce "a player cannot represent two teams in the same
 * tournament" at the service layer with a friendly error before the DB
 * unique constraint (tournament_id, player_id) would reject it anyway. */
export async function findSquadPlayerByPlayerId(tournamentId, playerId, client = pool) {
  const { rows } = await client.query('SELECT * FROM tournament_squad_players WHERE tournament_id = $1 AND player_id = $2', [tournamentId, playerId])
  return rows[0] || null
}

export async function removeSquadPlayer(tournamentId, playerId, client = pool) {
  await client.query('DELETE FROM tournament_squad_players WHERE tournament_id = $1 AND player_id = $2', [tournamentId, playerId])
}

// ---------------------------------------------------------------------------
// Tournament fixtures
// ---------------------------------------------------------------------------

export async function insertFixture(client, { tournamentId, stage, groupName = null, round = 1, bracketSlot = null, fixtureNumber, teamAId, teamBId }) {
  const { rows } = await client.query(
    `INSERT INTO tournament_fixtures (tournament_id, stage, group_name, round, bracket_slot, fixture_number, team_a_id, team_b_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [tournamentId, stage, groupName, round, bracketSlot, fixtureNumber, teamAId, teamBId]
  )
  return rows[0]
}

export async function countFixtures(tournamentId, client = pool) {
  const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM tournament_fixtures WHERE tournament_id = $1', [tournamentId])
  return rows[0].count
}

const FIXTURE_COLUMNS = `
  f.id, f.tournament_id, f.stage, f.group_name, f.round, f.bracket_slot, f.fixture_number,
  f.team_a_id, f.team_b_id, f.match_id,
  f.manual_result_winner_team_id, f.manual_result_by, f.manual_result_at,
  ta.name AS team_a_name, ta.short_name AS team_a_short, ta.logo_url AS team_a_logo,
  tb.name AS team_b_name, tb.short_name AS team_b_short, tb.logo_url AS team_b_logo,
  m.status AS match_status, m.match_date, m.venue,
  m.winner_team_id AS match_winner_team_id, m.result_type AS match_result_type,
  m.result_margin AS match_result_margin, m.result AS match_result_text,
  m.team_a_runs, m.team_a_wickets, m.team_b_runs, m.team_b_wickets,
  m.overs_per_innings, m.balls_per_over,
  i1.id AS i1_id, i1.batting_team_id AS i1_batting_team_id, i1.runs AS i1_runs,
  i1.wickets AS i1_wickets, i1.legal_balls AS i1_legal_balls, i1.status AS i1_status,
  i2.id AS i2_id, i2.batting_team_id AS i2_batting_team_id, i2.runs AS i2_runs,
  i2.wickets AS i2_wickets, i2.legal_balls AS i2_legal_balls, i2.status AS i2_status
`

// Live innings-cache join, shared by every FIXTURE_COLUMNS query. Only the
// two cache columns per innings (runs_cache/wickets_cache/legal_balls) that
// replay.js already keeps current on every delivery — never a per-fixture
// replay. Used only to surface a live score on the fixture card; finalized
// fixtures fall back to m.result* exactly as before.
const FIXTURE_INNINGS_JOIN = `
  LEFT JOIN innings i1 ON i1.match_id = f.match_id AND i1.innings_number = 1
  LEFT JOIN innings i2 ON i2.match_id = f.match_id AND i2.innings_number = 2
`

export async function listFixturesByTournament(tournamentId, client = pool) {
  const { rows } = await client.query(
    `SELECT ${FIXTURE_COLUMNS}
     FROM tournament_fixtures f
     JOIN teams ta ON ta.id = f.team_a_id
     JOIN teams tb ON tb.id = f.team_b_id
     LEFT JOIN matches m ON m.id = f.match_id
     ${FIXTURE_INNINGS_JOIN}
     WHERE f.tournament_id = $1
     ORDER BY f.fixture_number ASC`,
    [tournamentId]
  )
  return rows
}

export async function findFixtureById(id, client = pool) {
  const { rows } = await client.query(
    `SELECT ${FIXTURE_COLUMNS}
     FROM tournament_fixtures f
     JOIN teams ta ON ta.id = f.team_a_id
     JOIN teams tb ON tb.id = f.team_b_id
     LEFT JOIN matches m ON m.id = f.match_id
     ${FIXTURE_INNINGS_JOIN}
     WHERE f.id = $1`,
    [id]
  )
  return rows[0] || null
}

export async function findFixtureByMatchId(matchId, client = pool) {
  const { rows } = await client.query('SELECT * FROM tournament_fixtures WHERE match_id = $1', [matchId])
  return rows[0] || null
}

export async function listFixturesByStage(tournamentId, stage, client = pool) {
  const { rows } = await client.query(
    `SELECT ${FIXTURE_COLUMNS}
     FROM tournament_fixtures f
     JOIN teams ta ON ta.id = f.team_a_id
     JOIN teams tb ON tb.id = f.team_b_id
     LEFT JOIN matches m ON m.id = f.match_id
     ${FIXTURE_INNINGS_JOIN}
     WHERE f.tournament_id = $1 AND f.stage = $2
     ORDER BY f.bracket_slot ASC NULLS FIRST, f.fixture_number ASC`,
    [tournamentId, stage]
  )
  return rows
}

export async function setFixtureMatch(id, matchId, client = pool) {
  const { rows } = await client.query('UPDATE tournament_fixtures SET match_id = $2, updated_at = NOW() WHERE id = $1 RETURNING *', [id, matchId])
  return rows[0] || null
}

export async function setManualResult(id, { winnerTeamId, byUserId }, client = pool) {
  const { rows } = await client.query(
    'UPDATE tournament_fixtures SET manual_result_winner_team_id = $2, manual_result_by = $3, manual_result_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *',
    [id, winnerTeamId, byUserId]
  )
  return rows[0] || null
}

// ---------------------------------------------------------------------------
// Standings/statistics data sources — read-only projections of authoritative
// cricket truth (matches/innings/match_players), same "replay, never
// accumulate" principle as statistics.repository.js (Part 21/27).
// ---------------------------------------------------------------------------

/** Both innings of every FINALIZED match linked to this tournament's
 * fixtures, plus the roster-aware all-out threshold input (Part 26) — one
 * query, no N+1 (a correlated subquery, same pattern team.repository.js's
 * listPublicTeams already uses for its per-row counts). */
export async function listFinalizedTournamentInnings(tournamentId, client = pool) {
  const { rows } = await client.query(
    `SELECT i.match_id, i.batting_team_id, i.bowling_team_id, i.runs, i.wickets, i.legal_balls,
            (SELECT COUNT(*) FROM match_players mp WHERE mp.match_id = i.match_id AND mp.team_id = i.batting_team_id AND mp.is_playing_xi = true) AS batting_team_playing_xi_count
     FROM innings i
     JOIN tournament_fixtures f ON f.match_id = i.match_id
     JOIN matches m ON m.id = i.match_id
     WHERE f.tournament_id = $1 AND m.status = 'finalized'`,
    [tournamentId]
  )
  return rows
}

/** One row per FINALIZED tournament fixture with the fields standings.js/
 * points.js need (result type, winner) — Part 21/23: standings only ever
 * read the official match result, never re-derive it. */
export async function listFinalizedTournamentFixtureResults(tournamentId, client = pool) {
  const { rows } = await client.query(
    `SELECT f.id AS fixture_id, f.stage, f.match_id, f.team_a_id, f.team_b_id,
            m.result_type, m.winner_team_id
     FROM tournament_fixtures f
     JOIN matches m ON m.id = f.match_id
     WHERE f.tournament_id = $1 AND m.status = 'finalized'`,
    [tournamentId]
  )
  return rows
}

/** Every match_player id (Playing XI) across this tournament's finalized
 * fixtures, joined with which HISTORICAL tournament team they represented
 * (match_players.team_id, not players.team_id) — the input
 * tournamentStats.service.js replays for top run-scorers/wicket-takers,
 * strictly scoped to this tournament (Part 49 — never an unrelated match). */
export async function listFinalizedTournamentParticipation(tournamentId, client = pool) {
  const { rows } = await client.query(
    `SELECT mp.id AS match_player_id, mp.match_id, mp.team_id, mp.player_id,
            p.name, p.public_player_id
     FROM tournament_fixtures f
     JOIN matches m ON m.id = f.match_id
     JOIN match_players mp ON mp.match_id = m.id AND mp.is_playing_xi = true
     JOIN players p ON p.id = mp.player_id
     WHERE f.tournament_id = $1 AND m.status = 'finalized'`,
    [tournamentId]
  )
  return rows
}
