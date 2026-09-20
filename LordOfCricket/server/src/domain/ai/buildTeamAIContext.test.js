import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTeamAIContext } from './buildTeamAIContext.js'

function fakeProfile(overrides = {}) {
  return {
    team: { id: 3, name: 'LOC Strikers', shortName: 'LOC', logoUrl: null, registeredAt: '2025-01-01' },
    squad: [{ publicPlayerId: 'LOC-1' }, { publicPlayerId: 'LOC-2' }],
    record: { matches: 20, wins: 14, losses: 5, ties: 1, noResults: 0, winPercentage: 70 },
    recentForm: Array.from({ length: 8 }, (_, i) => ({ result: 'W', opponent: `Team ${i}`, date: '2026-01-01' })),
    recentMatches: Array.from({ length: 8 }, (_, i) => ({ teamA: { id: 3, name: 'LOC Strikers' }, teamB: { id: 99 + i, name: `Team ${i}` }, result: 'Won', matchDate: '2026-01-01' })),
    liveMatch: null,
    upcomingFixtures: [],
    topPerformers: { topRunScorer: { player: { name: 'A Player' }, runs: 400 }, topWicketTaker: { player: { name: 'B Player' }, wickets: 18 } },
    ...overrides,
  }
}

test('extracts official record/top performers faithfully', () => {
  const ctx = buildTeamAIContext(fakeProfile())
  assert.equal(ctx.name, 'LOC Strikers')
  assert.equal(ctx.record.wins, 14)
  assert.equal(ctx.topRunScorer.runs, 400)
  assert.equal(ctx.topWicketTaker.wickets, 18)
})

test('recentForm/recentMatches are bounded to 5', () => {
  const ctx = buildTeamAIContext(fakeProfile())
  assert.equal(ctx.recentForm.length, 5)
  assert.equal(ctx.recentMatches.length, 5)
})

test('handles a team with no top performers yet without crashing', () => {
  const ctx = buildTeamAIContext(fakeProfile({ topPerformers: { topRunScorer: null, topWicketTaker: null } }))
  assert.equal(ctx.topRunScorer, null)
  assert.equal(ctx.topWicketTaker, null)
})

test('deterministic', () => {
  const profile = fakeProfile()
  assert.deepEqual(buildTeamAIContext(profile), buildTeamAIContext(profile))
})
