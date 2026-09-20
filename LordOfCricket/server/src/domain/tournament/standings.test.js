import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sortStandings } from './standings.js'

function row(teamId, { points, nrr, won }) {
  return { teamId, teamName: `Team ${teamId}`, played: 0, won, lost: 0, tied: 0, noResult: 0, points, nrr }
}

test('standings: sorted by points DESC first', () => {
  const rows = [row(1, { points: 4, nrr: 0, won: 2 }), row(2, { points: 6, nrr: -1, won: 3 })]
  const sorted = sortStandings(rows)
  assert.deepEqual(sorted.map((r) => r.teamId), [2, 1])
  assert.equal(sorted[0].position, 1)
  assert.equal(sorted[1].position, 2)
})

test('standings: NRR DESC breaks a points tie', () => {
  const rows = [row(1, { points: 4, nrr: 0.5, won: 2 }), row(2, { points: 4, nrr: 1.2, won: 2 })]
  const sorted = sortStandings(rows)
  assert.deepEqual(sorted.map((r) => r.teamId), [2, 1])
})

test('standings: wins DESC breaks a points+NRR tie', () => {
  const rows = [row(1, { points: 4, nrr: 0.5, won: 2 }), row(2, { points: 4, nrr: 0.5, won: 3 })]
  const sorted = sortStandings(rows)
  assert.deepEqual(sorted.map((r) => r.teamId), [2, 1])
})

test('standings: teamId ASC is the deterministic final tie-break', () => {
  const rows = [row(5, { points: 4, nrr: 0.5, won: 2 }), row(2, { points: 4, nrr: 0.5, won: 2 })]
  const sorted = sortStandings(rows)
  assert.deepEqual(sorted.map((r) => r.teamId), [2, 5])
})
