// Fixture generation, scheduling, and knockout progression — the layer that
// turns tournament registration into real matches. Every generated fixture
// eventually links to exactly one row in the EXISTING `matches` table
// (created via match.service.js#createMatch, completely unmodified) — this
// file never scores anything, never derives a winner itself, and never
// touches deliveries/innings. See docs/ARCHITECTURE.md's Phase 15 section
// for the full "tournament sits above the match system" diagram.

import { pool } from '../config/db.js'
import * as repo from '../repositories/tournament.repository.js'
import * as matchService from './match.service.js'
import { computeGroupStandings, computeStandings } from './tournamentStandings.service.js'
import { TournamentError, TOURNAMENT_ERROR_CODES as CODES } from '../domain/tournament/errors.js'
import { generateRoundRobinRounds, generateKnockoutFirstRound, nextRoundSlotPairing, SUPPORTED_KNOCKOUT_SIZES } from '../domain/tournament/fixtures.js'
import { crossGroupSemiFinalPairing } from '../domain/tournament/qualification.js'
import { isRoundComplete, isFixtureResolved, winnerOf } from '../domain/tournament/progression.js'

function toFixtureResult(f) {
  return { matchStatus: f.match_status, resultType: f.match_result_type, winnerTeamId: f.match_winner_team_id, manualWinnerTeamId: f.manual_result_winner_team_id }
}

// ---------------------------------------------------------------------------
// Generation (Part 12/13/14/15 — league/groups/knockout, idempotent)
// ---------------------------------------------------------------------------

export async function generateFixtures(tournamentId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const tournament = await repo.lockTournamentForUpdate(client, tournamentId)
    if (!tournament) throw new TournamentError(CODES.TOURNAMENT_NOT_FOUND, 'Tournament not found.')
    if (tournament.status !== 'REGISTRATION') {
      if (['SCHEDULED', 'LIVE', 'COMPLETED'].includes(tournament.status)) {
        throw new TournamentError(CODES.FIXTURES_ALREADY_GENERATED, 'Fixtures have already been generated for this tournament.')
      }
      throw new TournamentError(CODES.INVALID_TOURNAMENT_STATE, `Cannot generate fixtures while tournament is '${tournament.status}'.`)
    }

    const teams = await repo.listTournamentTeams(tournamentId, client)
    const insertions = []
    let fixtureNumber = 1

    if (tournament.format === 'LEAGUE') {
      if (teams.length < 2) throw new TournamentError(CODES.INVALID_TEAM_COUNT, 'A league needs at least 2 registered teams.')
      const rounds = generateRoundRobinRounds(teams.map((t) => t.team_id))
      rounds.forEach((pairs, roundIdx) => {
        pairs.forEach(([a, b]) => insertions.push({ stage: 'LEAGUE', round: roundIdx + 1, teamAId: a, teamBId: b, fixtureNumber: fixtureNumber++ }))
      })
    } else if (tournament.format === 'GROUPS_KNOCKOUT') {
      if (teams.length < 4 || teams.length % 2 !== 0) {
        throw new TournamentError(CODES.INVALID_TEAM_COUNT, 'Groups + Knockout requires an even number of teams (minimum 4), split evenly into two groups.')
      }
      const half = teams.length / 2
      const allAssigned = teams.every((t) => t.group_name)
      let groupA
      let groupB
      if (allAssigned) {
        groupA = teams.filter((t) => t.group_name === 'A')
        groupB = teams.filter((t) => t.group_name === 'B')
        if (groupA.length !== half || groupB.length !== half) {
          throw new TournamentError(CODES.INVALID_TEAM_COUNT, `Groups must be evenly split (${half} teams each).`)
        }
      } else {
        // Deterministic auto-assignment (Part 14 — "not random"): alternate
        // by registration order, and PERSIST it so the UI/API reflect the
        // real assignment from then on, not a value re-guessed per read.
        groupA = teams.filter((_, i) => i % 2 === 0)
        groupB = teams.filter((_, i) => i % 2 === 1)
        for (const t of groupA) await repo.updateTournamentTeamGroup(t.id, 'A', client)
        for (const t of groupB) await repo.updateTournamentTeamGroup(t.id, 'B', client)
      }
      const roundsA = generateRoundRobinRounds(groupA.map((t) => t.team_id))
      const roundsB = generateRoundRobinRounds(groupB.map((t) => t.team_id))
      roundsA.forEach((pairs, roundIdx) => pairs.forEach(([a, b]) => insertions.push({ stage: 'GROUP', groupName: 'A', round: roundIdx + 1, teamAId: a, teamBId: b, fixtureNumber: fixtureNumber++ })))
      roundsB.forEach((pairs, roundIdx) => pairs.forEach(([a, b]) => insertions.push({ stage: 'GROUP', groupName: 'B', round: roundIdx + 1, teamAId: a, teamBId: b, fixtureNumber: fixtureNumber++ })))
      // SEMI_FINAL/FINAL are generated later by advanceTournament(), once the group stage is fully resolved.
    } else if (tournament.format === 'KNOCKOUT') {
      if (!SUPPORTED_KNOCKOUT_SIZES.includes(teams.length)) {
        throw new TournamentError(CODES.INVALID_TEAM_COUNT, `Direct knockout supports exactly ${SUPPORTED_KNOCKOUT_SIZES.join(' or ')} teams (this tournament has ${teams.length} registered).`)
      }
      const stageForSize = { 8: 'QUARTER_FINAL', 4: 'SEMI_FINAL', 2: 'FINAL' }
      const stage = stageForSize[teams.length]
      const pairs = generateKnockoutFirstRound(teams.map((t) => t.team_id))
      pairs.forEach(([a, b], idx) => insertions.push({ stage, round: 1, bracketSlot: idx + 1, teamAId: a, teamBId: b, fixtureNumber: fixtureNumber++ }))
    }

    for (const fixture of insertions) {
      await repo.insertFixture(client, { tournamentId, ...fixture })
    }

    const updated = await repo.updateTournament(tournamentId, { status: 'SCHEDULED' }, client)
    await client.query('COMMIT')
    return updated
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function listFixtures(tournamentId) {
  const tournament = await repo.findTournamentById(tournamentId)
  if (!tournament) throw new TournamentError(CODES.TOURNAMENT_NOT_FOUND, 'Tournament not found.')
  return repo.listFixturesByTournament(tournamentId)
}

// ---------------------------------------------------------------------------
// Scheduling (Part 19) — creates the real LOC match via the UNCHANGED
// match.service.js, inheriting format from the tournament (Part 18).
// ---------------------------------------------------------------------------

export async function scheduleFixture(fixtureId, { matchDate, venue = null }) {
  const fixture = await repo.findFixtureById(fixtureId)
  if (!fixture) throw new TournamentError(CODES.FIXTURE_NOT_FOUND, 'Fixture not found.')
  if (fixture.match_id) throw new TournamentError(CODES.INVALID_FIXTURE_STATE, 'This fixture is already scheduled.')
  if (!matchDate || Number.isNaN(new Date(matchDate).getTime())) throw new TournamentError(CODES.VALIDATION_ERROR, 'matchDate must be a valid date.')

  const tournament = await repo.findTournamentById(fixture.tournament_id)
  const match = await matchService.createMatch({
    teamAId: fixture.team_a_id,
    teamBId: fixture.team_b_id,
    venue,
    matchDate,
    oversPerInnings: tournament.overs_per_innings,
    ballsPerOver: tournament.balls_per_over,
  })
  await repo.setFixtureMatch(fixtureId, match.id)
  return repo.findFixtureById(fixtureId)
}

// ---------------------------------------------------------------------------
// Progression (Part 24/25/32/33/34/35/36/37/38) — idempotent by construction:
// re-running never duplicates a next-round fixture (existence-checked under
// the tournament row's lock, backstopped by the DB's own UNIQUE(tournament_id,
// stage, bracket_slot) constraint), and never fires for anything but a
// FINALIZED match (finalize is a one-way lock — see match.service.js's
// comment — so a bracket can never go stale from a later correction; Part 34).
// ---------------------------------------------------------------------------

async function advanceGroupsToSemis(client, tournamentId) {
  const groupFixtures = await repo.listFixturesByStage(tournamentId, 'GROUP', client)
  if (groupFixtures.length === 0) return
  if (!isRoundComplete(groupFixtures.map(toFixtureResult))) return
  const existingSemis = await repo.listFixturesByStage(tournamentId, 'SEMI_FINAL', client)
  if (existingSemis.length > 0) return

  const { groupA, groupB } = await computeGroupStandings(tournamentId, client)
  const pairing = crossGroupSemiFinalPairing(groupA, groupB)
  let fixtureNumber = (await repo.countFixtures(tournamentId, client)) + 1
  for (const p of pairing) {
    await repo.insertFixture(client, { tournamentId, stage: 'SEMI_FINAL', round: 1, bracketSlot: p.slot, teamAId: p.teamAId, teamBId: p.teamBId, fixtureNumber: fixtureNumber++ })
  }
}

async function advanceBracketStage(client, tournamentId, currentStage, nextStage) {
  const currentFixtures = await repo.listFixturesByStage(tournamentId, currentStage, client)
  if (currentFixtures.length === 0) return // this stage doesn't exist for this bracket size
  if (!isRoundComplete(currentFixtures.map(toFixtureResult))) return
  const existingNext = await repo.listFixturesByStage(tournamentId, nextStage, client)
  if (existingNext.length > 0) return // already advanced

  const bySlot = new Map(currentFixtures.map((f) => [f.bracket_slot, f]))
  const pairing = nextRoundSlotPairing(currentFixtures.length)
  let fixtureNumber = (await repo.countFixtures(tournamentId, client)) + 1
  for (const p of pairing) {
    const winnerA = winnerOf(toFixtureResult(bySlot.get(p.slotA)))
    const winnerB = winnerOf(toFixtureResult(bySlot.get(p.slotB)))
    await repo.insertFixture(client, { tournamentId, stage: nextStage, round: 1, bracketSlot: p.nextSlot, teamAId: winnerA, teamBId: winnerB, fixtureNumber: fixtureNumber++ })
  }
}

async function maybeCrownChampion(client, tournamentId, tournament) {
  if (tournament.champion_team_id != null) return
  const finalFixtures = await repo.listFixturesByStage(tournamentId, 'FINAL', client)
  if (finalFixtures.length !== 1) return
  const result = toFixtureResult(finalFixtures[0])
  if (!isFixtureResolved(result)) return
  await repo.updateTournament(tournamentId, { champion_team_id: winnerOf(result), status: 'COMPLETED' }, client)
}

/** Re-checks the whole bracket for this tournament — safe/cheap to call
 * repeatedly (idempotent), and the only place that creates next-round
 * fixtures or crowns a champion for KNOCKOUT/GROUPS_KNOCKOUT formats. */
export async function advanceTournament(tournamentId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const tournament = await repo.lockTournamentForUpdate(client, tournamentId)
    if (!tournament) {
      await client.query('ROLLBACK')
      return
    }

    if (tournament.format === 'GROUPS_KNOCKOUT') {
      await advanceGroupsToSemis(client, tournamentId)
      await advanceBracketStage(client, tournamentId, 'SEMI_FINAL', 'FINAL')
    } else if (tournament.format === 'KNOCKOUT') {
      await advanceBracketStage(client, tournamentId, 'QUARTER_FINAL', 'SEMI_FINAL')
      await advanceBracketStage(client, tournamentId, 'SEMI_FINAL', 'FINAL')
    }

    if (tournament.format !== 'LEAGUE') {
      await maybeCrownChampion(client, tournamentId, tournament)
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** Called after a linked match starts (match.controller.js hook) — SCHEDULED
 * -> LIVE the moment the tournament's first ball is actually bowled, never
 * merely because a date passed (Part 37). No-op for a non-tournament match. */
export async function onMatchStarted(matchId) {
  const fixture = await repo.findFixtureByMatchId(matchId)
  if (!fixture) return
  const tournament = await repo.findTournamentById(fixture.tournament_id)
  if (tournament && tournament.status === 'SCHEDULED') {
    await repo.updateTournament(tournament.id, { status: 'LIVE' })
  }
}

/** Called after a linked match is finalized (match.controller.js hook).
 * Deliberately swallow-nothing at the call site's discretion: this throws on
 * a genuine bug, but callers wrap it defensively so a tournament-progression
 * error can never fail the underlying match finalize response. */
export async function onMatchFinalized(matchId) {
  const fixture = await repo.findFixtureByMatchId(matchId)
  if (!fixture) return
  await advanceTournament(fixture.tournament_id)
}

// ---------------------------------------------------------------------------
// Manual resolution (Part 35/36) — staff-authorized, explicit, persisted.
// LOC has no Super Over engine, so this is the one honest way a tied/
// no-result knockout match still lets a bracket continue.
// ---------------------------------------------------------------------------

export async function resolveFixtureManually(fixtureId, { winnerTeamId, byUserId }) {
  const fixture = await repo.findFixtureById(fixtureId)
  if (!fixture) throw new TournamentError(CODES.FIXTURE_NOT_FOUND, 'Fixture not found.')
  if (fixture.match_status !== 'finalized') {
    throw new TournamentError(CODES.INVALID_FIXTURE_STATE, 'Only a finalized match can be manually resolved.')
  }
  if (fixture.match_result_type !== 'TIE' && fixture.match_result_type !== 'NO_RESULT') {
    throw new TournamentError(CODES.INVALID_FIXTURE_STATE, 'Manual resolution is only for a tied or no-result match — this fixture already has a decisive result.')
  }
  if (![fixture.team_a_id, fixture.team_b_id].includes(winnerTeamId)) {
    throw new TournamentError(CODES.VALIDATION_ERROR, "winnerTeamId must be one of this fixture's two teams.")
  }
  await repo.setManualResult(fixtureId, { winnerTeamId, byUserId })
  await advanceTournament(fixture.tournament_id)
  return repo.findFixtureById(fixtureId)
}

// ---------------------------------------------------------------------------
// LEAGUE completion (Part 31/37) — a pure league has no knockout "final" to
// hook into, so completion is one explicit staff action once every league
// fixture is finalized. Champion = final standings position 1 (Part 28's
// documented tie-break).
// ---------------------------------------------------------------------------

export async function completeLeagueTournament(tournamentId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const tournament = await repo.lockTournamentForUpdate(client, tournamentId)
    if (!tournament) throw new TournamentError(CODES.TOURNAMENT_NOT_FOUND, 'Tournament not found.')
    if (tournament.format !== 'LEAGUE') throw new TournamentError(CODES.INVALID_TOURNAMENT_STATE, 'Only LEAGUE tournaments are completed this way.')
    if (tournament.status === 'COMPLETED') throw new TournamentError(CODES.INVALID_TOURNAMENT_STATE, 'Tournament is already completed.')
    const fixtures = await repo.listFixturesByStage(tournamentId, 'LEAGUE', client)
    if (fixtures.length === 0 || !fixtures.every((f) => f.match_status === 'finalized')) {
      throw new TournamentError(CODES.INVALID_TOURNAMENT_STATE, 'Every league fixture must be scheduled and finalized before the tournament can be completed.')
    }

    const standings = await computeStandings(tournamentId, { stage: 'LEAGUE', client })
    const champion = standings[0]?.teamId ?? null

    const updated = await repo.updateTournament(tournamentId, { champion_team_id: champion, status: 'COMPLETED' }, client)
    await client.query('COMMIT')
    return updated
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
