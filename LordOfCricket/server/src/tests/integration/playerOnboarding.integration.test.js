// First-Login Player Profile Onboarding. Real HTTP pattern matching every
// other integration test in this codebase: http.createServer(app) on a
// random port, plain fetch(), no mocking of the database. Covers the new
// players columns/validation and the player_onboarding_completed flag this
// feature adds to the existing GET/PATCH /me/player endpoints — photo
// upload itself is already covered by playerPhotoUpload.integration.test.js
// and is not duplicated here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { findUserById } from '../../models/user.model.js'

async function startTestApp() {
  const httpServer = http.createServer(app)
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return {
    baseUrl: `http://localhost:${port}/api`,
    async close() {
      await new Promise((resolve) => httpServer.close(resolve))
    },
  }
}

async function createPlayerUser(label) {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const user = (
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,'not-a-real-hash','player') RETURNING *`,
      [`Onboarding Test ${label}`, `onboarding-test-${label}-${tag}@example.test`],
    )
  ).rows[0]
  return {
    id: user.id,
    token: signToken({ id: user.id }),
    async cleanup() {
      await pool.query('DELETE FROM players WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function patchPlayer(server, token, body) {
  return fetch(`${server.baseUrl}/me/player`, { method: 'PATCH', headers: authHeader(token), body: JSON.stringify(body) })
}

test('no auth -> 401 on PATCH /me/player', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/me/player`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    assert.equal(res.status, 401)
  } finally {
    await server.close()
  }
})

test('a fresh Player has no players row yet, and player_onboarding_completed reads as null (not inferred true/false)', async () => {
  const server = await startTestApp()
  const user = await createPlayerUser('fresh')
  try {
    const res = await fetch(`${server.baseUrl}/me/player`, { headers: authHeader(user.token) })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.player, null)

    const shapedUser = await findUserById(user.id)
    assert.equal(shapedUser.player_onboarding_completed, null)
  } finally {
    await user.cleanup()
    await server.close()
  }
})

test('Skip: a PATCH with only profile_onboarding_completed=true creates the player row, sets the flag, and leaves every other field null', async () => {
  const server = await startTestApp()
  const user = await createPlayerUser('skip')
  try {
    const res = await patchPlayer(server, user.token, { profile_onboarding_completed: true })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.player.profile_onboarding_completed, true)
    assert.equal(body.player.nickname, null)
    assert.equal(body.player.bio, null)
    assert.equal(body.player.date_of_birth, null)
    assert.equal(body.player.is_wicket_keeper, false)

    const shapedUser = await findUserById(user.id)
    assert.equal(shapedUser.player_onboarding_completed, true)
  } finally {
    await user.cleanup()
    await server.close()
  }
})

test('Save: a full onboarding payload persists every field and sets profile_onboarding_completed', async () => {
  const server = await startTestApp()
  const user = await createPlayerUser('save')
  try {
    const res = await patchPlayer(server, user.token, {
      nickname: 'The Finisher',
      bio: 'Right-hand batsman who enjoys aggressive cricket.',
      jersey_number: 7,
      date_of_birth: '1998-04-12',
      batting_style: 'RIGHT_HAND',
      bowling_style: 'LEFT_ARM_ORTHODOX',
      is_wicket_keeper: true,
      address_line: '221B Baker Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      postal_code: '400001',
      profile_onboarding_completed: true,
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.player.nickname, 'The Finisher')
    assert.equal(body.player.jersey_number, 7)
    assert.equal(body.player.date_of_birth, '1998-04-12')
    assert.equal(body.player.batting_style, 'RIGHT_HAND')
    assert.equal(body.player.bowling_style, 'LEFT_ARM_ORTHODOX')
    assert.equal(body.player.is_wicket_keeper, true)
    assert.equal(body.player.address_line, '221B Baker Street')
    assert.equal(body.player.state, 'Maharashtra')
    assert.equal(body.player.postal_code, '400001')
    assert.equal(body.player.profile_onboarding_completed, true)
  } finally {
    await user.cleanup()
    await server.close()
  }
})

test('onboarding does not appear again after completion: player_onboarding_completed stays true on a later fetch', async () => {
  const server = await startTestApp()
  const user = await createPlayerUser('persist')
  try {
    await patchPlayer(server, user.token, { profile_onboarding_completed: true })
    const res = await fetch(`${server.baseUrl}/me/player`, { headers: authHeader(user.token) })
    const body = await res.json()
    assert.equal(body.player.profile_onboarding_completed, true)

    const shapedUser = await findUserById(user.id)
    assert.equal(shapedUser.player_onboarding_completed, true)
  } finally {
    await user.cleanup()
    await server.close()
  }
})

test('invalid jersey number is rejected (out of 0-999 range and non-integer)', async () => {
  const server = await startTestApp()
  const user = await createPlayerUser('jersey')
  try {
    assert.equal((await patchPlayer(server, user.token, { jersey_number: -1 })).status, 400)
    assert.equal((await patchPlayer(server, user.token, { jersey_number: 1000 })).status, 400)
    assert.equal((await patchPlayer(server, user.token, { jersey_number: 7.5 })).status, 400)
  } finally {
    await user.cleanup()
    await server.close()
  }
})

test('invalid date of birth is rejected (bad format, future date, absurdly old)', async () => {
  const server = await startTestApp()
  const user = await createPlayerUser('dob')
  try {
    assert.equal((await patchPlayer(server, user.token, { date_of_birth: 'not-a-date' })).status, 400)
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365)
    assert.equal((await patchPlayer(server, user.token, { date_of_birth: future.toISOString().slice(0, 10) })).status, 400)
    assert.equal((await patchPlayer(server, user.token, { date_of_birth: '1850-01-01' })).status, 400)
  } finally {
    await user.cleanup()
    await server.close()
  }
})

test('invalid batting style is rejected', async () => {
  const server = await startTestApp()
  const user = await createPlayerUser('batting')
  try {
    const res = await patchPlayer(server, user.token, { batting_style: 'AMBIDEXTROUS' })
    assert.equal(res.status, 400)
  } finally {
    await user.cleanup()
    await server.close()
  }
})

test('invalid bowling style/combination is rejected — only the 9 real enum values (or NONE) are ever accepted', async () => {
  const server = await startTestApp()
  const user = await createPlayerUser('bowling')
  try {
    const res = await patchPlayer(server, user.token, { bowling_style: 'RIGHT_ARM_SPIN' })
    assert.equal(res.status, 400)
  } finally {
    await user.cleanup()
    await server.close()
  }
})

test('is_wicket_keeper must be a real boolean, not "Y"/"yes"/1', async () => {
  const server = await startTestApp()
  const user = await createPlayerUser('wk-type')
  try {
    assert.equal((await patchPlayer(server, user.token, { is_wicket_keeper: 'Y' })).status, 400)
    assert.equal((await patchPlayer(server, user.token, { is_wicket_keeper: 1 })).status, 400)
  } finally {
    await user.cleanup()
    await server.close()
  }
})

test('Wicketkeeper Yes stores true, No stores false', async () => {
  const server = await startTestApp()
  const user = await createPlayerUser('wk-bool')
  try {
    const yes = await patchPlayer(server, user.token, { is_wicket_keeper: true })
    assert.equal((await yes.json()).player.is_wicket_keeper, true)

    const no = await patchPlayer(server, user.token, { is_wicket_keeper: false })
    assert.equal((await no.json()).player.is_wicket_keeper, false)
  } finally {
    await user.cleanup()
    await server.close()
  }
})

test('a Player can only ever modify their own profile — two players never see or clobber each other\'s data', async () => {
  const server = await startTestApp()
  const userA = await createPlayerUser('auth-a')
  const userB = await createPlayerUser('auth-b')
  try {
    await patchPlayer(server, userA.token, { nickname: 'Alpha' })
    await patchPlayer(server, userB.token, { nickname: 'Bravo' })

    const resA = await fetch(`${server.baseUrl}/me/player`, { headers: authHeader(userA.token) })
    const resB = await fetch(`${server.baseUrl}/me/player`, { headers: authHeader(userB.token) })
    assert.equal((await resA.json()).player.nickname, 'Alpha')
    assert.equal((await resB.json()).player.nickname, 'Bravo')
  } finally {
    await userA.cleanup()
    await userB.cleanup()
    await server.close()
  }
})

test('an Umpire account never needs Player onboarding — no players row is created just by logging in, and player_onboarding_completed stays null', async () => {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const umpireUser = (
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash','player','umpire') RETURNING *`,
      [`Onboarding Test Umpire`, `onboarding-test-umpire-${tag}@example.test`],
    )
  ).rows[0]
  try {
    const shapedUser = await findUserById(umpireUser.id)
    assert.equal(shapedUser.role, 'player')
    assert.equal(shapedUser.player_type, 'umpire')
    assert.equal(shapedUser.player_onboarding_completed, null)

    const playerRow = await pool.query('SELECT id FROM players WHERE user_id = $1', [umpireUser.id])
    assert.equal(playerRow.rows.length, 0)
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [umpireUser.id])
  }
})
