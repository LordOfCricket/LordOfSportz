import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCareerTimeline } from './careerTimeline.js'

function perf({ matchId, date, teamId = 1, runs = 0, wkts = 0 }) {
  return {
    matchId,
    date,
    teamId,
    batting: runs ? { didBat: true, runs } : { didBat: false },
    bowling: wkts ? { didBowl: true, wickets: wkts } : { didBowl: false },
  }
}

const teamHistory = [
  { teamId: 1, name: 'Rovers', shortName: 'ROV', logoUrl: null },
  { teamId: 2, name: 'Strikers', shortName: 'STR', logoUrl: 'x.png' },
]

test('groups by calendar year (newest first), sums runs/wickets/matches from real per-match data', () => {
  const chrono = [
    perf({ matchId: 1, date: '2023-04-10', teamId: 1, runs: 40 }),
    perf({ matchId: 2, date: '2023-09-20', teamId: 1, runs: 10, wkts: 3 }),
    perf({ matchId: 3, date: '2024-05-01', teamId: 2, runs: 55 }),
  ]
  const tl = buildCareerTimeline({ chronoPerformances: chrono, teamHistory, earnedAchievements: [] })
  assert.deepEqual(tl.map((y) => y.year), [2024, 2023])
  assert.equal(tl[1].matches, 2)
  assert.equal(tl[1].runs, 50)
  assert.equal(tl[1].wickets, 3)
  assert.equal(tl[0].year, 2024)
  assert.equal(tl[0].teams[0].teamId, 2)
  assert.equal(tl[0].teams[0].name, 'Strikers')
})

test('multiple teams in one year are listed most-played-first, using the real match_players.team_id snapshot', () => {
  const chrono = [
    perf({ matchId: 1, date: '2024-01-01', teamId: 1 }),
    perf({ matchId: 2, date: '2024-02-01', teamId: 2 }),
    perf({ matchId: 3, date: '2024-03-01', teamId: 2 }),
  ]
  const tl = buildCareerTimeline({ chronoPerformances: chrono, teamHistory, earnedAchievements: [] })
  assert.equal(tl.length, 1)
  assert.deepEqual(tl[0].teams.map((t) => t.teamId), [2, 1])
  assert.equal(tl[0].teams[0].matches, 2)
})

test('earned milestones slot into the year of their real achievedOn.date; dateless milestones are skipped', () => {
  const chrono = [perf({ matchId: 5, date: '2023-07-01', teamId: 1, runs: 500 })]
  const earned = [
    { id: 'runs-500', title: '500 Career Runs', achievedOn: { matchId: 5, date: '2023-07-01', opponent: 'Foes' } },
    { id: 'catches-10', title: '10 Catches', achievedOn: null },
  ]
  const tl = buildCareerTimeline({ chronoPerformances: chrono, teamHistory, earnedAchievements: earned })
  assert.equal(tl[0].milestones.length, 1)
  assert.equal(tl[0].milestones[0].id, 'runs-500')
  assert.equal(tl[0].milestones[0].matchId, 5)
})

test('empty history -> empty timeline', () => {
  assert.deepEqual(buildCareerTimeline({ chronoPerformances: [], teamHistory, earnedAchievements: [] }), [])
})

test('year is read from the literal YYYY (timezone-proof), not a UTC round-trip', () => {
  const chrono = [perf({ matchId: 1, date: '2023-12-31', teamId: 1, runs: 10 })]
  const tl = buildCareerTimeline({ chronoPerformances: chrono, teamHistory, earnedAchievements: [] })
  assert.equal(tl[0].year, 2023)
})
