// Player Role Audit — GET /teams/:id/players requires only requireAuth (any
// authenticated user, not just this team's own players/staff). The route
// previously returned the raw `players` row, including genuine PII columns
// (nickname/date_of_birth/address_line/state/postal_code) added for
// onboarding — a stranger with no relationship to the team could read
// another player's home address and date of birth. Fixed by reusing
// publicTeam.service.js's own already-established `mapPublicSquadPlayer`
// allowlist (previously only applied to the public roster read).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { createTeamsFixture } from './fixtures.js'

async function startTestApp() {
  const httpServer = http.createServer(app)
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return { baseUrl: `http://localhost:${port}/api`, async close() { await new Promise((r) => httpServer.close(r)) } }
}

test('GET /teams/:id/players never leaks PII to an unrelated authenticated user', async () => {
  const server = await startTestApp()
  const fx = await createTeamsFixture({ squadSize: 1 })
  const stranger = (
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Integration Test Stranger', $1, 'not-a-real-hash', 'player') RETURNING *`,
      [`teams-players-privacy-stranger-${Date.now()}@example.test`],
    )
  ).rows[0]
  try {
    await pool.query(
      `UPDATE players SET nickname = $1, date_of_birth = '1995-01-01', address_line = '123 Secret Lane', state = 'Secret State', postal_code = '000000' WHERE id = $2`,
      ['SecretNick', fx.squadA[0].id],
    )

    const res = await fetch(`${server.baseUrl}/teams/${fx.teamAId}/players`, {
      headers: { Authorization: `Bearer ${signToken({ id: stranger.id })}` },
    })
    assert.equal(res.status, 200)
    const { players } = await res.json()
    const row = players.find((p) => p.publicPlayerId === fx.squadA[0].public_player_id)
    assert.ok(row, 'the roster entry must still be present')

    // Public-safe fields survive.
    assert.equal(row.name, fx.squadA[0].name)
    assert.equal(row.jerseyNumber, fx.squadA[0].jersey_number)

    // PII/internal fields must never appear anywhere in the response.
    const serialized = JSON.stringify(players)
    for (const leaked of ['date_of_birth', 'address_line', 'postal_code', 'SecretNick', '123 Secret Lane', 'Secret State', 'nickname', 'user_id']) {
      assert.ok(!serialized.includes(leaked), `response must not contain "${leaked}"`)
    }
  } finally {
    await fx.cleanup()
    await pool.query('DELETE FROM users WHERE id = $1', [stranger.id])
    await server.close()
  }
})
