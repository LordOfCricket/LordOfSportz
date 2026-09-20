// Phase 13 — team roster membership (players.team_id) previously had no
// HTTP-reachable write path at all (audit finding: only a dev-only seed
// script, which refuses to run in production, ever set it). Proved against
// real PostgreSQL through the actual service layer, same pattern as
// publicTeam.integration.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../../config/db.js'
import { findPlayerById } from '../../models/player.model.js'
import * as teamRosterService from '../../services/teamRoster.service.js'
import { createTeamsFixture } from './fixtures.js'

test('addPlayerToTeamRoster: a player with no team joins the requested team', async () => {
  const fx = await createTeamsFixture({ squadSize: 1 })
  try {
    // createTeamsFixture always seats squadB's player on teamB — detach them
    // first so this test exercises a genuine "no team yet" player.
    await pool.query('UPDATE players SET team_id = NULL WHERE id = $1', [fx.squadB[0].id])

    const players = await teamRosterService.addPlayerToTeamRoster(fx.teamAId, fx.squadB[0].public_player_id)
    assert.ok(players.some((p) => p.id === fx.squadB[0].id))

    const reloaded = await findPlayerById(fx.squadB[0].id)
    assert.equal(reloaded.team_id, fx.teamAId)
  } finally {
    await fx.cleanup()
  }
})

test('addPlayerToTeamRoster: assigning a player already on another team MOVES them (single FK, one team at a time)', async () => {
  const fx = await createTeamsFixture({ squadSize: 1 })
  try {
    assert.equal((await findPlayerById(fx.squadB[0].id)).team_id, fx.teamBId, 'fixture sanity check')

    await teamRosterService.addPlayerToTeamRoster(fx.teamAId, fx.squadB[0].public_player_id)

    const reloaded = await findPlayerById(fx.squadB[0].id)
    assert.equal(reloaded.team_id, fx.teamAId, 'player moved to the new team')
  } finally {
    await fx.cleanup()
  }
})

test('addPlayerToTeamRoster: adding a player already on the target team is rejected with 409, not a silent no-op', async () => {
  const fx = await createTeamsFixture({ squadSize: 1 })
  try {
    await assert.rejects(
      () => teamRosterService.addPlayerToTeamRoster(fx.teamAId, fx.squadA[0].public_player_id),
      (err) => err.statusCode === 409
    )
  } finally {
    await fx.cleanup()
  }
})

test('addPlayerToTeamRoster: nonexistent team or player is a structured 404, never a 500', async () => {
  const fx = await createTeamsFixture({ squadSize: 1 })
  try {
    await assert.rejects(() => teamRosterService.addPlayerToTeamRoster(999999999, fx.squadA[0].public_player_id), (err) => err.statusCode === 404)
    await assert.rejects(() => teamRosterService.addPlayerToTeamRoster(fx.teamAId, 'NOT-A-REAL-PUBLIC-ID'), (err) => err.statusCode === 404)
  } finally {
    await fx.cleanup()
  }
})

test('removePlayerFromTeamRoster: removing a current squad member clears team_id, roster reflects it immediately', async () => {
  const fx = await createTeamsFixture({ squadSize: 1 })
  try {
    const players = await teamRosterService.removePlayerFromTeamRoster(fx.teamAId, fx.squadA[0].public_player_id)
    assert.ok(!players.some((p) => p.id === fx.squadA[0].id))

    const reloaded = await findPlayerById(fx.squadA[0].id)
    assert.equal(reloaded.team_id, null)
  } finally {
    await fx.cleanup()
  }
})

test('removePlayerFromTeamRoster: removing a player who is not on this team is a structured 404, never a silent success', async () => {
  const fx = await createTeamsFixture({ squadSize: 1 })
  try {
    // squadB's player is on teamB, not teamA.
    await assert.rejects(
      () => teamRosterService.removePlayerFromTeamRoster(fx.teamAId, fx.squadB[0].public_player_id),
      (err) => err.statusCode === 404
    )
    // Confirmed unaffected — still on their real team.
    assert.equal((await findPlayerById(fx.squadB[0].id)).team_id, fx.teamBId)
  } finally {
    await fx.cleanup()
  }
})
