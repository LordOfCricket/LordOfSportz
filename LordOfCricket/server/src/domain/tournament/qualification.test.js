import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crossGroupSemiFinalPairing } from './qualification.js'

test('qualification: A1 vs B2, B1 vs A2 (the exact spec example)', () => {
  const groupA = [{ teamId: 101 }, { teamId: 102 }, { teamId: 103 }]
  const groupB = [{ teamId: 201 }, { teamId: 202 }]
  const pairing = crossGroupSemiFinalPairing(groupA, groupB)
  assert.deepEqual(pairing, [
    { slot: 1, teamAId: 101, teamBId: 202 },
    { slot: 2, teamAId: 201, teamBId: 102 },
  ])
})

test('qualification: fewer than 2 teams in a group throws rather than guessing a bracket', () => {
  assert.throws(() => crossGroupSemiFinalPairing([{ teamId: 1 }], [{ teamId: 2 }, { teamId: 3 }]))
  assert.throws(() => crossGroupSemiFinalPairing([{ teamId: 1 }, { teamId: 2 }], []))
})
