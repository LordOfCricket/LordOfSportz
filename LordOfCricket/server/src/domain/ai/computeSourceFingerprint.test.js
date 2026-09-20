import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeSourceFingerprint } from './computeSourceFingerprint.js'

test('same facts always produce the same fingerprint (deterministic, key-order independent)', () => {
  const a = computeSourceFingerprint({ matchId: 1, inningsVersions: [{ id: 10, version: 2 }] })
  const b = computeSourceFingerprint({ inningsVersions: [{ id: 10, version: 2 }], matchId: 1 })
  assert.equal(a, b)
})

test('a correction (version bump) changes the fingerprint even if totals are unchanged', () => {
  const before = computeSourceFingerprint({ matchId: 1, resultType: 'RUNS', inningsVersions: [{ id: 10, version: 2 }, { id: 11, version: 1 }] })
  const afterCorrection = computeSourceFingerprint({ matchId: 1, resultType: 'RUNS', inningsVersions: [{ id: 10, version: 3 }, { id: 11, version: 1 }] })
  assert.notEqual(before, afterCorrection)
})

test('different facts produce different fingerprints', () => {
  const a = computeSourceFingerprint({ resultType: 'RUNS' })
  const b = computeSourceFingerprint({ resultType: 'WICKETS' })
  assert.notEqual(a, b)
})
