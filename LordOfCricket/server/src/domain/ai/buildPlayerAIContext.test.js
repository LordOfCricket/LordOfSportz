import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPlayerAIContext } from './buildPlayerAIContext.js'

function fakeCareerStats(overrides = {}) {
  return {
    player: { id: 7, publicPlayerId: 'LOC-XYZ999', name: 'Test Player', role: 'BATSMAN' },
    career: {
      matches: 12,
      batting: { innings: 12, runs: 480, average: 40, strikeRate: 130, fifties: 4, hundreds: 1, highestScore: { runs: 102, notOut: false } },
      bowling: { innings: 3, wickets: 2, average: 30, economy: 6.5, bestBowling: { wickets: 2, runs: 20 } },
      fielding: { catches: 5, runOuts: 1, stumpings: 0 },
    },
    recentForm: Array.from({ length: 8 }, (_, i) => ({
      opponent: `Team ${i}`,
      result: 'Won by 5 runs',
      won: true,
      batting: { didBat: true, runs: 20 + i, balls: 15, notOut: false },
      bowling: { didBowl: false },
    })),
    matchHistory: { total: 12, limit: 0, offset: 0, items: [] },
    personalBests: {},
    ...overrides,
  }
}

test('extracts official career figures faithfully, never recomputes', () => {
  const ctx = buildPlayerAIContext(fakeCareerStats())
  assert.equal(ctx.publicPlayerId, 'LOC-XYZ999')
  assert.equal(ctx.matches, 12)
  assert.equal(ctx.batting.runs, 480)
  assert.equal(ctx.bowling.wickets, 2)
  assert.equal(ctx.fielding.catches, 5)
})

test('recentForm is bounded to 5 even when more is supplied', () => {
  const ctx = buildPlayerAIContext(fakeCareerStats())
  assert.equal(ctx.recentForm.length, 5)
})

test('never includes rating/prediction/personality fields — only what the input DTO supplies', () => {
  const ctx = buildPlayerAIContext(fakeCareerStats())
  const keys = JSON.stringify(ctx).toLowerCase()
  assert.ok(!keys.includes('rating'))
  assert.ok(!keys.includes('predict'))
})

test('deterministic', () => {
  const stats = fakeCareerStats()
  assert.deepEqual(buildPlayerAIContext(stats), buildPlayerAIContext(stats))
})
