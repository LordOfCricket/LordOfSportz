// Domain tests — pure, no database. Exercises the ranking engine + leaderboard
// metric registry directly against synthetic {player, career} entries.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankPlayers } from './ranking.js'
import { LEADERBOARD_METRICS, LEADERBOARD_QUALIFICATIONS, isValidMetric } from './leaderboardConfig.js'

function player(publicPlayerId, name = publicPlayerId) {
  return { publicPlayerId, name }
}

function battingCareer(overrides = {}) {
  return {
    matches: 5,
    batting: { innings: 5, notOuts: 1, runs: 100, ballsFaced: 80, fours: 5, sixes: 2, fifties: 0, hundreds: 0, average: 25, strikeRate: 125, ...overrides.batting },
    bowling: { innings: 0, wickets: 0, average: null, economy: null, equivalentOvers: 0, maidens: 0, bestBowling: null, ...overrides.bowling },
    fielding: { catches: 0, runOuts: 0, stumpings: 0, ...overrides.fielding },
    ...overrides,
  }
}

test('rankPlayers: assigns ordinal ranks 1..N over the qualified, sorted set', () => {
  const entries = [
    { player: player('P1'), career: battingCareer({ batting: { runs: 50 } }) },
    { player: player('P2'), career: battingCareer({ batting: { runs: 200 } }) },
    { player: player('P3'), career: battingCareer({ batting: { runs: 120 } }) },
  ]
  const { items, total } = rankPlayers(entries, LEADERBOARD_METRICS.runs)
  assert.equal(total, 3)
  assert.deepEqual(items.map((i) => [i.rank, i.player.publicPlayerId]), [
    [1, 'P2'],
    [2, 'P3'],
    [3, 'P1'],
  ])
})

test('rankPlayers: pagination preserves global rank — page 2 does not restart at #1', () => {
  const entries = Array.from({ length: 25 }, (_, i) =>
    ({ player: player(`P${i}`), career: battingCareer({ batting: { runs: 1000 - i } }) })
  )
  const { items, total } = rankPlayers(entries, LEADERBOARD_METRICS.runs, { limit: 10, offset: 10 })
  assert.equal(total, 25)
  assert.equal(items[0].rank, 11)
  assert.equal(items.length, 10)
  assert.equal(items[9].rank, 20)
})

test('rankPlayers: zero-value entries are excluded (a player with 0 sixes is not "Most Sixes" material)', () => {
  const entries = [
    { player: player('P1'), career: battingCareer({ batting: { sixes: 0 } }) },
    { player: player('P2'), career: battingCareer({ batting: { sixes: 3 } }) },
  ]
  const { items, total } = rankPlayers(entries, LEADERBOARD_METRICS.sixes)
  assert.equal(total, 1)
  assert.equal(items[0].player.publicPlayerId, 'P2')
})

test('rankPlayers: deterministic tie-break by publicPlayerId when every configured key ties', () => {
  const entries = [
    { player: player('Zebra'), career: battingCareer({ batting: { runs: 100, average: 25, innings: 5 } }) },
    { player: player('Apple'), career: battingCareer({ batting: { runs: 100, average: 25, innings: 5 } }) },
  ]
  const { items } = rankPlayers(entries, LEADERBOARD_METRICS.runs)
  assert.deepEqual(items.map((i) => i.player.publicPlayerId), ['Apple', 'Zebra'])
})

test('runs leaderboard: tie-break order is average DESC then fewer innings', () => {
  const entries = [
    { player: player('LowAvg'), career: battingCareer({ batting: { runs: 100, average: 10, innings: 10 } }) },
    { player: player('HighAvg'), career: battingCareer({ batting: { runs: 100, average: 50, innings: 2 } }) },
  ]
  const { items } = rankPlayers(entries, LEADERBOARD_METRICS.runs)
  assert.equal(items[0].player.publicPlayerId, 'HighAvg')
})

test('wickets leaderboard: bowling average is never treated as Infinity/best when null', () => {
  const entries = [
    { player: player('NeverTakenWicket'), career: battingCareer({ bowling: { wickets: 0, average: null, economy: null, equivalentOvers: 5 } }) },
    { player: player('OneWicket'), career: battingCareer({ bowling: { wickets: 1, average: 30, economy: 6, equivalentOvers: 5 } }) },
  ]
  const { items, total } = rankPlayers(entries, LEADERBOARD_METRICS.wickets)
  assert.equal(total, 1, 'a bowler with 0 wickets never appears on the wickets leaderboard')
  assert.equal(items[0].player.publicPlayerId, 'OneWicket')
})

test('batting-average qualification: excludes a 1-innings player even with a huge score (Part 80)', () => {
  const entries = [
    { player: player('OneInningsWonder'), career: battingCareer({ batting: { runs: 80, innings: 1, notOuts: 0, average: 80 } }) },
    { player: player('Consistent'), career: battingCareer({ batting: { runs: 200, innings: 5, notOuts: 1, average: 50 } }) },
  ]
  const { items, total } = rankPlayers(entries, LEADERBOARD_METRICS['batting-average'])
  assert.equal(total, 1)
  assert.equal(items[0].player.publicPlayerId, 'Consistent')
})

test('batting-average qualification: a never-dismissed batter cannot top the board via a null-as-infinite average', () => {
  const entries = [
    { player: player('NeverOut'), career: battingCareer({ batting: { runs: 500, innings: 5, notOuts: 5, average: null } }) },
    { player: player('Real'), career: battingCareer({ batting: { runs: 200, innings: 5, notOuts: 1, average: 50 } }) },
  ]
  const { items, total } = rankPlayers(entries, LEADERBOARD_METRICS['batting-average'])
  assert.equal(total, 1, 'the never-dismissed batter fails the minDismissals qualification, not just sorts last')
  assert.equal(items[0].player.publicPlayerId, 'Real')
})

test('batting-strike-rate qualification: 1 ball for 6 runs does not rank #1 over a real sample (Part 81)', () => {
  const entries = [
    { player: player('OneBallSix'), career: battingCareer({ batting: { runs: 6, ballsFaced: 1, strikeRate: 600 } }) },
    { player: player('RealInnings'), career: battingCareer({ batting: { runs: 90, ballsFaced: 60, strikeRate: 150 } }) },
  ]
  const { items, total } = rankPlayers(entries, LEADERBOARD_METRICS['batting-strike-rate'])
  assert.equal(total, 1)
  assert.equal(items[0].player.publicPlayerId, 'RealInnings')
})

test('bowling-average qualification: insufficient wickets excluded, zero/null average never qualifies', () => {
  const entries = [
    { player: player('TwoWickets'), career: battingCareer({ bowling: { wickets: 2, average: 5, economy: 4, equivalentOvers: 4 } }) },
    { player: player('ThreeWickets'), career: battingCareer({ bowling: { wickets: 3, average: 20, economy: 6, equivalentOvers: 6 } }) },
  ]
  const { items, total } = rankPlayers(entries, LEADERBOARD_METRICS['bowling-average'])
  assert.equal(total, 1)
  assert.equal(items[0].player.publicPlayerId, 'ThreeWickets')
})

test('economy qualification uses equivalent overs, not a naive legal-balls/6 assumption (Part 83)', () => {
  const entries = [
    // 12 legal balls in a 5-ball-over match = 2.4 equivalent overs -> below the minEquivalentOvers=3 threshold.
    { player: player('ShortFiveBallSpell'), career: battingCareer({ bowling: { wickets: 3, average: 10, economy: 5, equivalentOvers: 2.4 } }) },
    { player: player('QualifiedSpell'), career: battingCareer({ bowling: { wickets: 3, average: 12, economy: 6, equivalentOvers: 3 } }) },
  ]
  const { items, total } = rankPlayers(entries, LEADERBOARD_METRICS.economy)
  assert.equal(total, 1)
  assert.equal(items[0].player.publicPlayerId, 'QualifiedSpell')
})

test('best-bowling: more wickets always beats fewer runs; equal wickets tie-break on fewer runs (Part 85)', () => {
  const entries = [
    { player: player('Four18'), career: battingCareer({ bowling: { wickets: 4, bestBowling: { wickets: 4, runs: 18 } } }) },
    { player: player('Four22'), career: battingCareer({ bowling: { wickets: 4, bestBowling: { wickets: 4, runs: 22 } } }) },
    { player: player('Five31'), career: battingCareer({ bowling: { wickets: 5, bestBowling: { wickets: 5, runs: 31 } } }) },
  ]
  const { items } = rankPlayers(entries, LEADERBOARD_METRICS['best-bowling'])
  assert.deepEqual(items.map((i) => i.player.publicPlayerId), ['Five31', 'Four18', 'Four22'])
})

test('best-bowling: a wicketless spell never qualifies (0/4 is not a bowling achievement)', () => {
  const entries = [{ player: player('Wicketless'), career: battingCareer({ bowling: { wickets: 0, bestBowling: { wickets: 0, runs: 4 } } }) }]
  const { total } = rankPlayers(entries, LEADERBOARD_METRICS['best-bowling'])
  assert.equal(total, 0)
})

test('highest-score: more runs always wins; equal runs tie-break on not-out over dismissed (mirrors aggregateBatting\'s own tie-break)', () => {
  const entries = [
    { player: player('Dismissed80'), career: battingCareer({ batting: { highestScore: { runs: 80, notOut: false } } }) },
    { player: player('NotOut80'), career: battingCareer({ batting: { highestScore: { runs: 80, notOut: true } } }) },
    { player: player('Century'), career: battingCareer({ batting: { highestScore: { runs: 104, notOut: false } } }) },
  ]
  const { items } = rankPlayers(entries, LEADERBOARD_METRICS['highest-score'])
  assert.deepEqual(items.map((i) => i.player.publicPlayerId), ['Century', 'NotOut80', 'Dismissed80'])
})

test('highest-score: a duck (highest score of 0) never qualifies — not a real achievement', () => {
  const entries = [{ player: player('AlwaysZero'), career: battingCareer({ batting: { highestScore: { runs: 0, notOut: false } } }) }]
  const { total } = rankPlayers(entries, LEADERBOARD_METRICS['highest-score'])
  assert.equal(total, 0)
})

test('highest-score: a player with no innings played (highestScore null) never qualifies', () => {
  const entries = [{ player: player('NeverBatted'), career: battingCareer({ batting: { highestScore: null } }) }]
  const { total } = rankPlayers(entries, LEADERBOARD_METRICS['highest-score'])
  assert.equal(total, 0)
})

test('catches leaderboard: catches DESC then fewer matches', () => {
  const entries = [
    { player: player('ManyMatches'), career: battingCareer({ matches: 20, fielding: { catches: 3, runOuts: 0, stumpings: 0 } }) },
    { player: player('FewMatches'), career: battingCareer({ matches: 5, fielding: { catches: 3, runOuts: 0, stumpings: 0 } }) },
  ]
  const { items } = rankPlayers(entries, LEADERBOARD_METRICS.catches)
  assert.equal(items[0].player.publicPlayerId, 'FewMatches')
})

test('empty leaderboard: no entries at all returns a valid empty result, not an error', () => {
  const { items, total } = rankPlayers([], LEADERBOARD_METRICS.runs)
  assert.deepEqual(items, [])
  assert.equal(total, 0)
})

test('no qualifiers: career data exists but nobody meets qualification -> empty items, not an error', () => {
  const entries = [{ player: player('P1'), career: battingCareer({ batting: { innings: 1, notOuts: 0, average: 40, runs: 40 } }) }]
  const { items, total } = rankPlayers(entries, LEADERBOARD_METRICS['batting-average'])
  assert.deepEqual(items, [])
  assert.equal(total, 0)
})

test('isValidMetric / LEADERBOARD_QUALIFICATIONS are centralized and consistent', () => {
  assert.equal(isValidMetric('runs'), true)
  assert.equal(isValidMetric('not-a-real-metric'), false)
  assert.equal(LEADERBOARD_METRICS['batting-average'].qualification, LEADERBOARD_QUALIFICATIONS['batting-average'])
  assert.equal(LEADERBOARD_METRICS.economy.qualification, LEADERBOARD_QUALIFICATIONS.economy)
})
