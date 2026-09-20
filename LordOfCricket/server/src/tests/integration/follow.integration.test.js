// Priority 1 — Follow Players / Teams, proved against real PostgreSQL
// through the actual service layer (same pattern as matchAvailability /
// teamRoster integration tests).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as followService from '../../services/follow.service.js'
import { pool } from '../../config/db.js'
import { createTeamsFixture } from './fixtures.js'

async function makeUser(label) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, 'not-a-real-hash', 'player') RETURNING *`,
    [label, `follow-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`]
  )
  return rows[0]
}

test('follow/unfollow player: toggles, is idempotent, and self-follow is rejected', async () => {
  const fx = await createTeamsFixture({ squadSize: 2 })
  const user = await makeUser('Follower One')
  const { rows: p } = await pool.query('SELECT id, public_player_id, user_id FROM players WHERE id = $1', [fx.squadA[0].id])
  const player = p[0]
  try {
    assert.deepEqual(await followService.getPlayerFollowState(user.id, player.public_player_id), { following: false })

    assert.deepEqual(await followService.followPlayer(user.id, player.public_player_id), { following: true })
    // idempotent — a second follow does not throw or duplicate
    assert.deepEqual(await followService.followPlayer(user.id, player.public_player_id), { following: true })
    const { rows: cnt } = await pool.query('SELECT COUNT(*)::int AS c FROM user_follows WHERE user_id = $1 AND player_id = $2', [user.id, player.id])
    assert.equal(cnt[0].c, 1, 'exactly one row despite two follow calls')

    assert.deepEqual(await followService.getPlayerFollowState(user.id, player.public_player_id), { following: true })

    assert.deepEqual(await followService.unfollowPlayer(user.id, player.public_player_id), { following: false })
    assert.deepEqual(await followService.unfollowPlayer(user.id, player.public_player_id), { following: false })

    // self-follow: link this user to the player, then it must be rejected
    await pool.query('UPDATE players SET user_id = $1 WHERE id = $2', [user.id, player.id])
    await assert.rejects(() => followService.followPlayer(user.id, player.public_player_id), /cannot follow your own/i)
    await pool.query('UPDATE players SET user_id = $1 WHERE id = $2', [player.user_id, player.id])
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [user.id])
  }
})

test('follow team + Following list returns public-safe refs for both types', async () => {
  const fx = await createTeamsFixture({ squadSize: 1 })
  const user = await makeUser('Follower Two')
  const { rows: p } = await pool.query('SELECT public_player_id FROM players WHERE id = $1', [fx.squadA[0].id])
  try {
    await followService.followTeam(user.id, fx.teamAId)
    await followService.followPlayer(user.id, p[0].public_player_id)
    assert.deepEqual(await followService.getTeamFollowState(user.id, fx.teamAId), { following: true })

    const list = await followService.listFollowing(user.id)
    assert.equal(list.teams.total, 1)
    assert.equal(list.teams.items[0].id, fx.teamAId)
    assert.ok('shortName' in list.teams.items[0])
    assert.equal(list.players.total, 1)
    assert.equal(list.players.items[0].publicPlayerId, p[0].public_player_id)
    // never leaks a raw internal player id / user_id
    assert.equal(list.players.items[0].id, undefined)

    await followService.unfollowTeam(user.id, fx.teamAId)
    assert.equal((await followService.listFollowing(user.id)).teams.total, 0)
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [user.id])
  }
})

test('Priority 5 — follow/unfollow ground: toggles, idempotent, Following list carries public-safe ground refs', async () => {
  const user = await makeUser('Ground Follower')
  const { rows: g } = await pool.query(`SELECT public_ground_id FROM grounds WHERE status = 'ACTIVE' LIMIT 1`)
  if (g.length === 0) return // no ACTIVE ground seeded in this environment
  const publicGroundId = g[0].public_ground_id
  try {
    assert.deepEqual(await followService.getGroundFollowState(user.id, publicGroundId), { following: false })

    assert.deepEqual(await followService.followGround(user.id, publicGroundId), { following: true })
    assert.deepEqual(await followService.followGround(user.id, publicGroundId), { following: true }) // idempotent
    const { rows: cnt } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM user_follows f JOIN grounds gg ON gg.id = f.ground_id WHERE f.user_id = $1 AND gg.public_ground_id = $2`,
      [user.id, publicGroundId]
    )
    assert.equal(cnt[0].c, 1)

    const list = await followService.listFollowing(user.id)
    assert.equal(list.grounds.total, 1)
    assert.equal(list.grounds.items[0].publicGroundId, publicGroundId)
    assert.ok('name' in list.grounds.items[0] && 'city' in list.grounds.items[0])
    assert.equal(list.grounds.items[0].id, undefined) // never a raw internal id
    assert.ok(!/email|phone|user_id/i.test(JSON.stringify(list.grounds)))

    assert.deepEqual(await followService.unfollowGround(user.id, publicGroundId), { following: false })
    assert.equal((await followService.listFollowing(user.id)).grounds.total, 0)

    await assert.rejects(() => followService.followGround(user.id, 'GRD-DOES-NOT-EXIST'), (e) => e.statusCode === 404)
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [user.id])
  }
})

test('unknown player / non-numeric team id -> 404', async () => {
  const user = await makeUser('Follower Three')
  try {
    await assert.rejects(() => followService.followPlayer(user.id, 'PLR-does-not-exist'), (e) => e.statusCode === 404)
    await assert.rejects(() => followService.followTeam(user.id, 'abc'), (e) => e.statusCode === 404)
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [user.id])
  }
})
