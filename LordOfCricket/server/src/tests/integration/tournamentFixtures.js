// Shared setup/teardown for Phase 15 tournament integration tests — same
// "real PostgreSQL, explicit cleanup, Integration Test-prefixed rows" style
// as tests/integration/fixtures.js. Deliberately reuses that file's bowl()/
// bowlDots() helpers (they only need an inningsId/bowler/input, nothing
// tournament-specific) rather than re-implementing scoring.

import { pool } from '../../config/db.js'
import { createPlayer } from '../../models/player.model.js'

export { bowl, bowlDots } from './fixtures.js'

export async function createStaffUser() {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ('Integration Test Organizer', $1, 'not-a-real-hash', 'staff') RETURNING *`,
    [`integration-test-organizer-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`]
  )
  return rows[0]
}

export async function createRegularUser() {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ('Integration Test Regular User', $1, 'not-a-real-hash', 'player') RETURNING *`,
    [`integration-test-regular-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`]
  )
  return rows[0]
}

export async function createTeamsWithSquads(count, squadSize = 3) {
  const teams = []
  for (let i = 0; i < count; i++) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${i}`
    const { rows } = await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,$2) RETURNING *`, [`Tournament Test Team ${suffix}`, `TT${i}`.slice(0, 10)])
    const team = rows[0]
    const players = []
    for (let j = 1; j <= squadSize; j++) {
      players.push(await createPlayer({ name: `T${i}P${j} (test)`, teamId: team.id, role: j === squadSize ? 'BOWLER' : 'BATSMAN' }))
    }
    teams.push({ team, players })
  }
  return teams
}

export async function cleanupTournamentTest({ tournamentIds = [], matchIds = [], teamIds = [], playerIds = [], userIds = [] }) {
  // Deleting the tournament cascades away tournament_teams/tournament_squad_players/
  // tournament_fixtures (schema.sql's ON DELETE CASCADE), but NOT the `matches`
  // rows fixtures pointed at (a plain FK, not a cascade source) — do this FIRST
  // so matches can then be deleted without a dangling tournament_fixtures.match_id reference.
  if (tournamentIds.length) await pool.query('DELETE FROM tournaments WHERE id = ANY($1)', [tournamentIds])
  if (matchIds.length) {
    await pool.query('DELETE FROM innings WHERE match_id = ANY($1)', [matchIds])
    await pool.query('DELETE FROM match_players WHERE match_id = ANY($1)', [matchIds])
    await pool.query('DELETE FROM matches WHERE id = ANY($1)', [matchIds])
  }
  if (playerIds.length) await pool.query('DELETE FROM players WHERE id = ANY($1)', [playerIds])
  if (teamIds.length) await pool.query('DELETE FROM teams WHERE id = ANY($1)', [teamIds])
  if (userIds.length) await pool.query('DELETE FROM users WHERE id = ANY($1)', [userIds])
}
