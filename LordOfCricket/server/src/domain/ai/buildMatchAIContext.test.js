import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMatchAIContext } from './buildMatchAIContext.js'

function fakeSummary(overrides = {}) {
  return {
    match: { id: 42, status: 'finalized', isOfficial: true, venue: 'LOC Ground', matchDate: '2026-01-01', oversPerInnings: 10, ballsPerOver: 6 },
    teams: { teamA: { id: 1, name: 'LOC Strikers' }, teamB: { id: 2, name: 'Riverside Warriors' } },
    toss: { winnerTeamId: 1, decision: 'bat' },
    result: { winnerTeamId: 1, resultType: 'RUNS', resultMargin: 18, text: 'LOC Strikers won by 18 runs' },
    innings: [
      {
        inningsNumber: 1,
        battingTeamId: 1,
        bowlingTeamId: 2,
        score: { legalBalls: 60, endReason: 'OVERS_COMPLETE' },
        total: { runs: 140, wickets: 4, oversLabel: '10.0', runRate: 14 },
        batting: [
          { player: { publicPlayerId: 'LOC-AAA111', name: 'A Player', email: 'secret@example.com' }, runs: 64, balls: 40, fours: 6, sixes: 2, status: 'NOT_OUT' },
          { player: { publicPlayerId: 'LOC-BBB222', name: 'B Player' }, runs: 20, balls: 15, fours: 1, sixes: 0, status: 'OUT' },
        ],
        bowling: [{ player: { publicPlayerId: 'LOC-CCC333', name: 'C Player' }, oversLabel: '4.0', runs: 22, wickets: 3, economy: 5.5 }],
      },
      {
        inningsNumber: 2,
        battingTeamId: 2,
        bowlingTeamId: 1,
        score: { legalBalls: 60, endReason: 'OVERS_COMPLETE' },
        total: { runs: 122, wickets: 8, oversLabel: '10.0', runRate: 12.2 },
        batting: [{ player: { publicPlayerId: 'LOC-DDD444', name: 'D Player' }, runs: 40, balls: 30, fours: 3, sixes: 1, status: 'OUT' }],
        bowling: [{ player: { publicPlayerId: 'LOC-EEE555', name: 'E Player' }, oversLabel: '4.0', runs: 18, wickets: 2, economy: 4.5 }],
      },
    ],
    tournamentContext: null,
    ...overrides,
  }
}

function fakeCommentaryRows() {
  return [
    { type: 'WICKET', innings_number: 1, ball_label: '2.3', text: 'WICKET! B Player is bowled.', source_delivery_id: 501, source_event_id: null },
    { type: 'DELIVERY', innings_number: 1, ball_label: '3.1', text: 'FOUR! Cracking cover drive.', tags: ['FOUR'], source_delivery_id: 505, source_event_id: null },
    { type: 'MILESTONE', innings_number: 1, ball_label: '8.4', text: 'FIFTY! A Player brings up a well-made half-century.', source_delivery_id: 540, source_event_id: null },
    { type: 'DELIVERY', innings_number: 1, ball_label: '5.2', text: 'Dot ball.', tags: ['DOT'], source_delivery_id: 520, source_event_id: null },
  ]
}

test('extracts result/teams/innings totals faithfully from the summary DTO (never recomputes)', () => {
  const ctx = buildMatchAIContext(fakeSummary(), [])
  assert.equal(ctx.matchId, 42)
  assert.equal(ctx.teamA, 'LOC Strikers')
  assert.equal(ctx.result.resultType, 'RUNS')
  assert.equal(ctx.result.resultMargin, 18)
  assert.equal(ctx.innings[0].totalRuns, 140)
  assert.equal(ctx.innings[1].totalWickets, 8)
})

test('private fields (e.g. email) never survive into the context, even if present on the input DTO', () => {
  const ctx = buildMatchAIContext(fakeSummary(), [])
  const serialized = JSON.stringify(ctx)
  assert.ok(!serialized.includes('secret@example.com'))
  assert.ok(!serialized.includes('email'))
})

test('top batters/bowlers are bounded and only include players who actually appear in FACTS.allowedPlayerIds', () => {
  const ctx = buildMatchAIContext(fakeSummary(), [])
  assert.ok(ctx.innings[0].topBatters.length <= 3)
  assert.ok(ctx.innings[0].topBowlers.length <= 3)
  for (const b of ctx.innings[0].topBatters) assert.ok(ctx.allowedPlayerIds.includes(b.publicPlayerId))
})

test('key-moment candidates get stable application-assigned ids, never a raw delivery id as the AI-facing reference', () => {
  const ctx = buildMatchAIContext(fakeSummary(), fakeCommentaryRows())
  // Only WICKET/MILESTONE/boundary-DELIVERY rows become candidates — the dot ball is excluded.
  assert.equal(ctx.candidateKeyMoments.length, 3)
  assert.deepEqual(ctx.candidateKeyMoments.map((c) => c.candidateId), ['km-1', 'km-2', 'km-3'])
  // The real deliveryId is preserved internally (for the app to re-attach after AI selection), not fabricated.
  assert.equal(ctx.candidateKeyMoments[0].deliveryId, 501)
})

test('bounded: candidate key moments never exceed the cap regardless of how many commentary rows exist', () => {
  const manyRows = Array.from({ length: 50 }, (_, i) => ({ type: 'WICKET', innings_number: 1, ball_label: `${i}.1`, text: 'WICKET!', source_delivery_id: i, source_event_id: null }))
  const ctx = buildMatchAIContext(fakeSummary(), manyRows)
  assert.ok(ctx.candidateKeyMoments.length <= 15)
})

test('deterministic — same input always produces the same output', () => {
  const summary = fakeSummary()
  const rows = fakeCommentaryRows()
  assert.deepEqual(buildMatchAIContext(summary, rows), buildMatchAIContext(summary, rows))
})

test('tournament context passes through only when present, never fabricated for a non-tournament match', () => {
  const ctxNoTournament = buildMatchAIContext(fakeSummary(), [])
  assert.equal(ctxNoTournament.tournament, null)

  const ctxWithTournament = buildMatchAIContext(fakeSummary({ tournamentContext: { name: 'LOC Cup', stage: 'FINAL', groupName: null } }), [])
  assert.deepEqual(ctxWithTournament.tournament, { name: 'LOC Cup', stage: 'FINAL', groupName: null })
})
