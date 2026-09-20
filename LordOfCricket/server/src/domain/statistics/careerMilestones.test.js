import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeCareerAchievements } from './careerMilestones.js'

function perf({ matchId, date, opponent = 'Foes', runs = null, wkts = null }) {
  return {
    matchId,
    date,
    opponent,
    batting: runs == null ? { didBat: false } : { didBat: true, runs },
    bowling: wkts == null ? { didBowl: false } : { didBowl: true, wickets: wkts },
  }
}

const emptyCareer = {
  matches: 0,
  batting: { runs: 0, fifties: 0, hundreds: 0 },
  bowling: { wickets: 0, fiveWicketHauls: 0 },
  fielding: { catches: 0 },
}

test('no matches: nothing earned, no "next"', () => {
  const { earned, next } = computeCareerAchievements({ career: emptyCareer, chronoPerformances: [] })
  assert.deepEqual(earned, [])
  assert.equal(next, null)
})

test('debut + 10 matches earned; dates come from the exact Nth chronological match', () => {
  const chrono = Array.from({ length: 12 }, (_, i) =>
    perf({ matchId: 100 + i, date: `2024-0${1 + (i % 9)}-15`, runs: 5 })
  )
  const career = { ...emptyCareer, matches: 12, batting: { runs: 60, fifties: 0, hundreds: 0 } }
  const { earned } = computeCareerAchievements({ career, chronoPerformances: chrono })
  const debut = earned.find((a) => a.id === 'appearances-1')
  const ten = earned.find((a) => a.id === 'appearances-10')
  assert.ok(debut && ten)
  assert.equal(debut.achievedOn.matchId, 100)
  assert.equal(ten.achievedOn.matchId, 109)
  assert.equal(earned.find((a) => a.id === 'appearances-25'), undefined)
})

test('500 career runs: achievedOn is the match where the cumulative total first crosses 500', () => {
  const chrono = [
    perf({ matchId: 1, date: '2023-05-01', runs: 200 }),
    perf({ matchId: 2, date: '2023-06-01', runs: 250 }),
    perf({ matchId: 3, date: '2023-07-01', runs: 60 }), // cumulative 510 -> crosses here
    perf({ matchId: 4, date: '2023-08-01', runs: 40 }),
  ]
  const career = { ...emptyCareer, matches: 4, batting: { runs: 550, fifties: 1, hundreds: 1 } }
  const { earned } = computeCareerAchievements({ career, chronoPerformances: chrono })
  const runs500 = earned.find((a) => a.id === 'runs-500')
  assert.ok(runs500)
  assert.equal(runs500.achievedOn.matchId, 3)
  assert.equal(earned.find((a) => a.id === 'runs-1000'), undefined)
})

test('first century + first fifty resolve to the first qualifying innings; 5wi needs a real 5-wicket match', () => {
  const chrono = [
    perf({ matchId: 1, date: '2022-01-01', runs: 30 }),
    perf({ matchId: 2, date: '2022-02-01', runs: 74, wkts: 2 }),
    perf({ matchId: 3, date: '2022-03-01', runs: 118, wkts: 5 }),
  ]
  const career = {
    matches: 3,
    batting: { runs: 222, fifties: 1, hundreds: 1 },
    bowling: { wickets: 7, fiveWicketHauls: 1 },
    fielding: { catches: 0 },
  }
  const { earned } = computeCareerAchievements({ career, chronoPerformances: chrono })
  assert.equal(earned.find((a) => a.id === 'first-fifty').achievedOn.matchId, 2)
  assert.equal(earned.find((a) => a.id === 'first-hundred').achievedOn.matchId, 3)
  assert.equal(earned.find((a) => a.id === 'five-wicket-haul').achievedOn.matchId, 3)
})

test('fielding milestones never carry a date (no per-match fielding source)', () => {
  const career = { ...emptyCareer, matches: 30, fielding: { catches: 12 } }
  const { earned } = computeCareerAchievements({ career, chronoPerformances: [] })
  const catches10 = earned.find((a) => a.id === 'catches-10')
  assert.ok(catches10)
  assert.equal(catches10.achievedOn, null)
})

test('"next" is the closest un-earned milestone with real progress, and is null when nothing is in progress', () => {
  const career = {
    matches: 8, // 63% toward 10-matches... but runs is closer
    batting: { runs: 470, fifties: 2, hundreds: 0 }, // 94% toward 500
    bowling: { wickets: 0, fiveWicketHauls: 0 },
    fielding: { catches: 0 },
  }
  const { next } = computeCareerAchievements({ career, chronoPerformances: [] })
  assert.equal(next.id, 'runs-500')
  assert.equal(next.achieved, false)

  const { next: none } = computeCareerAchievements({ career: emptyCareer, chronoPerformances: [] })
  assert.equal(none, null)
})
