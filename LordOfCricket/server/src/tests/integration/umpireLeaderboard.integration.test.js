// Umpire Intelligence & Scale 2.0 — GET /stats/top-umpires. Real HTTP + DB.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'

function stubIo() {
  const chain = { emit: () => {} }
  return { emit: () => {}, to: () => chain }
}

async function startTestApp() {
  const httpServer = http.createServer(app)
  app.locals.io = stubIo()
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return {
    baseUrl: `http://localhost:${port}/api`,
    async close() {
      await new Promise((resolve) => httpServer.close(resolve))
    },
  }
}

async function json(url) {
  const res = await fetch(url)
  return { status: res.status, data: await res.json() }
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function approvedUmpire(label) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash','player','umpire') RETURNING *`,
    [`Integration Test ${label}`, `integration-test-lb-${label}-${uniqueTag()}@example.test`],
  )
  const user = rows[0]
  await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, 'approved', NOW())`, [user.id])
  return {
    id: user.id,
    token: signToken({ id: user.id, name: user.name }),
    async cleanup() {
      await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

test('top-umpires is public, ranked by the shared deterministic model (not raw rating), and leaks no private data', async () => {
  const server = await startTestApp()
  const strong = await approvedUmpire('lb-strong')
  const weak = await approvedUmpire('lb-weak')
  try {
    await pool.query(`UPDATE umpire_profiles SET rating_avg=4.9, rating_count=30 WHERE user_id = $1`, [strong.id])
    await pool.query(`INSERT INTO umpire_profiles (user_id, rating_avg, rating_count) SELECT $1, 4.9, 30 WHERE NOT EXISTS (SELECT 1 FROM umpire_profiles WHERE user_id=$1)`, [strong.id])

    const res = await json(`${server.baseUrl}/stats/top-umpires?limit=50`)
    assert.equal(res.status, 200, JSON.stringify(res.data))
    const strongEntry = res.data.items.find((i) => i.id === strong.id)
    const weakEntry = res.data.items.find((i) => i.id === weak.id)
    assert.ok(strongEntry)
    assert.ok(weakEntry)
    assert.ok(strongEntry.rank < weakEntry.rank, 'a well-rated umpire must rank ahead of a brand-new one')
    const raw = JSON.stringify(res.data)
    assert.ok(!raw.includes('@example.test'), 'no email must ever appear on the leaderboard')
  } finally {
    await strong.cleanup()
    await weak.cleanup()
    await server.close()
  }
})

test('top-umpires respects limit/offset pagination deterministically', async () => {
  const server = await startTestApp()
  const first = await json(`${server.baseUrl}/stats/top-umpires?limit=2&offset=0`)
  const second = await json(`${server.baseUrl}/stats/top-umpires?limit=2&offset=2`)
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.ok(first.data.items.length <= 2)
  const firstIds = first.data.items.map((i) => i.id)
  const secondIds = second.data.items.map((i) => i.id)
  assert.ok(firstIds.every((id) => !secondIds.includes(id)), 'pages must never overlap')
  await server.close()
})
