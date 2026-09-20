import { pool } from '../config/db.js'

// `client` defaults to pool but accepts a transaction client — U3's
// match.service.js createMatch inserts the match and its umpire slots
// (matchUmpireSlot.model.js's createSlotsForMatch) as one transaction.
export async function createMatch(
  { teamAId, teamBId, venue, matchDate, status = 'upcoming', oversPerInnings = null, ballsPerOver = 6, rules = {}, groundId = null, requiredUmpires = 0 },
  client = pool
) {
  const { rows } = await client.query(
    `INSERT INTO matches (team_a_id, team_b_id, venue, match_date, status, overs_per_innings, balls_per_over, rules, ground_id, required_umpires)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [teamAId, teamBId, venue, matchDate, status, oversPerInnings, ballsPerOver, rules, groundId, requiredUmpires]
  )
  return rows[0]
}

export async function findMatchByIdWithTeams(id) {
  const { rows } = await pool.query(
    `SELECT
       m.*,
       ta.name AS team_a_name, ta.short_name AS team_a_short, ta.logo_url AS team_a_logo,
       tb.name AS team_b_name, tb.short_name AS team_b_short, tb.logo_url AS team_b_logo
     FROM matches m
     JOIN teams ta ON ta.id = m.team_a_id
     JOIN teams tb ON tb.id = m.team_b_id
     WHERE m.id = $1`,
    [id]
  )
  return rows[0] || null
}

export async function findMatchById(id) {
  const { rows } = await pool.query('SELECT * FROM matches WHERE id = $1', [id])
  return rows[0] || null
}

export async function findAllMatches() {
  const { rows } = await pool.query('SELECT * FROM matches ORDER BY match_date DESC')
  return rows
}

export async function findAllMatchesWithTeams() {
  const { rows } = await pool.query(`
    SELECT
      m.*,
      ta.name AS team_a_name, ta.short_name AS team_a_short,
      tb.name AS team_b_name, tb.short_name AS team_b_short
    FROM matches m
    JOIN teams ta ON ta.id = m.team_a_id
    JOIN teams tb ON tb.id = m.team_b_id
    ORDER BY m.match_date DESC
  `)
  return rows
}

// U5 — Ground Owner's own match list for one ground. Unfiltered by
// status/slot-availability (unlike U4's findAvailableMatchesForUmpire) — the
// owner sees ALL of their ground's matches (upcoming/live/completed/
// finalized), not just ones still accepting umpire applications. Slot
// counts use the same correlated-subquery technique as U4's umpire
// discovery query, so "0/2 filled" is always live, never stale.
export async function findMatchesByGroundId(groundId) {
  const { rows } = await pool.query(
    `SELECT
       m.id, m.match_date, m.venue, m.status, m.required_umpires,
       ta.name AS team_a_name, ta.short_name AS team_a_short,
       tb.name AS team_b_name, tb.short_name AS team_b_short,
       (SELECT COUNT(*)::int FROM match_umpire_slots s WHERE s.match_id = m.id) AS total_slots,
       -- 'COMPLETED' as well as 'ASSIGNED' (Phase 23): this list includes
       -- completed/finalized matches (see the function comment above), and
       -- by the time a match completes, every slot that was ASSIGNED has
       -- already transitioned to COMPLETED (officiating credit) — an
       -- ASSIGNED-only count would wrongly show a fully-staffed completed
       -- match as "0 filled".
       (SELECT COUNT(*)::int FROM match_umpire_slots s WHERE s.match_id = m.id AND s.status IN ('ASSIGNED', 'COMPLETED')) AS filled_slots
     FROM matches m
     JOIN teams ta ON ta.id = m.team_a_id
     JOIN teams tb ON tb.id = m.team_b_id
     WHERE m.ground_id = $1
     ORDER BY m.match_date DESC`,
    [groundId],
  )
  return rows
}

export async function findMatchesByStatus(status) {
  const { rows } = await pool.query(
    'SELECT * FROM matches WHERE status = $1 ORDER BY match_date DESC',
    [status]
  )
  return rows
}

// Phase 10 Part 1 — public match discovery. Single query (no N+1): joins
// both innings rows (at most 2 per match) by innings_number and reads their
// CACHE columns (runs/wickets/legal_balls — the same read model replay.js
// writes back after every delivery/correction) rather than replaying. `order`
// is one of publicMatch domain's fixed keys, never raw request input, so this
// stays injection-safe without needing to parametrize the ORDER BY clause.
const DISCOVERY_COLUMNS = `
  m.id, m.status, m.venue, m.match_date, m.overs_per_innings, m.balls_per_over,
  m.winner_team_id, m.result_type, m.result_margin, m.result,
  ta.id AS team_a_id, ta.name AS team_a_name, ta.short_name AS team_a_short, ta.logo_url AS team_a_logo,
  tb.id AS team_b_id, tb.name AS team_b_name, tb.short_name AS team_b_short, tb.logo_url AS team_b_logo,
  i1.id AS i1_id, i1.status AS i1_status, i1.batting_team_id AS i1_batting_team_id,
  i1.runs AS i1_runs, i1.wickets AS i1_wickets, i1.legal_balls AS i1_legal_balls,
  i2.id AS i2_id, i2.status AS i2_status, i2.batting_team_id AS i2_batting_team_id,
  i2.runs AS i2_runs, i2.wickets AS i2_wickets, i2.legal_balls AS i2_legal_balls,
  COUNT(*) OVER()::int AS total_count
`

const DISCOVERY_ORDER = {
  live: 'm.match_date DESC, m.id DESC',
  upcoming: 'm.match_date ASC, m.id ASC',
  results: 'COALESCE(m.completed_at, m.match_date) DESC, m.id DESC',
}

// `teamId` (Phase 10 Part 2) is an optional additive filter — omitted by
// every Part 1 caller (unchanged behavior), passed by publicTeam.service.js
// to scope a team profile's live/upcoming/recent-match previews to matches
// that team actually played, reusing this exact read model rather than a
// second one (Part 48).
export async function listMatchesForDiscovery({ statuses, order, limit, offset, teamId = null }) {
  const orderClause = DISCOVERY_ORDER[order]
  const { rows } = await pool.query(
    `SELECT ${DISCOVERY_COLUMNS}
     FROM matches m
     JOIN teams ta ON ta.id = m.team_a_id
     JOIN teams tb ON tb.id = m.team_b_id
     LEFT JOIN innings i1 ON i1.match_id = m.id AND i1.innings_number = 1
     LEFT JOIN innings i2 ON i2.match_id = m.id AND i2.innings_number = 2
     WHERE m.status = ANY($1::text[])
       AND ($4::integer IS NULL OR m.team_a_id = $4 OR m.team_b_id = $4)
     ORDER BY ${orderClause}
     LIMIT $2 OFFSET $3`,
    [statuses, limit, offset, teamId]
  )
  return { rows, total: rows[0]?.total_count ?? 0 }
}

export async function updateMatch(id, fields, client = pool) {
  const keys = Object.keys(fields)
  if (keys.length === 0) return findMatchById(id)

  const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ')
  const { rows } = await client.query(
    `UPDATE matches SET ${setClause} WHERE id = $1 RETURNING *`,
    [id, ...keys.map((key) => fields[key])]
  )
  return rows[0] || null
}

export async function deleteMatch(id) {
  await pool.query('DELETE FROM matches WHERE id = $1', [id])
}
