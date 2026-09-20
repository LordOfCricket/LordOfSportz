import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateRoundRobinRounds, generateKnockoutFirstRound, nextRoundSlotPairing, SUPPORTED_KNOCKOUT_SIZES } from './fixtures.js'

function allPairsFor(teamIds) {
  const expected = new Set()
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      expected.add([teamIds[i], teamIds[j]].sort().join('-'))
    }
  }
  return expected
}

function flattenPairs(rounds) {
  return rounds.flat()
}

for (const n of [2, 3, 4, 5, 6]) {
  test(`round robin: ${n} teams — every required pair appears exactly once, no self-match, no duplicate`, () => {
    const teamIds = Array.from({ length: n }, (_, i) => i + 1)
    const rounds = generateRoundRobinRounds(teamIds)
    const pairs = flattenPairs(rounds)

    // No self-match.
    for (const [a, b] of pairs) assert.notEqual(a, b)

    // No duplicate pair, and every expected pair appears exactly once.
    const seen = new Set()
    for (const [a, b] of pairs) {
      const key = [a, b].sort().join('-')
      assert.equal(seen.has(key), false, `pair ${key} appeared more than once`)
      seen.add(key)
    }
    assert.deepEqual(seen, allPairsFor(teamIds))
  })
}

test('round robin: odd team count produces a real bye each round (fewer pairs that round)', () => {
  const rounds = generateRoundRobinRounds([1, 2, 3])
  // 3 teams -> 3 rounds, 1 real pair per round (one team byes each round).
  assert.equal(rounds.length, 3)
  for (const round of rounds) assert.equal(round.length, 1)
})

test('round robin: deterministic — same input always produces the same output', () => {
  const teamIds = [10, 20, 30, 40, 50]
  const a = generateRoundRobinRounds(teamIds)
  const b = generateRoundRobinRounds(teamIds)
  assert.deepEqual(a, b)
})

test('round robin: fewer than 2 teams produces no fixtures', () => {
  assert.deepEqual(generateRoundRobinRounds([1]), [])
  assert.deepEqual(generateRoundRobinRounds([]), [])
})

test('knockout first round: 8 teams pairs 1v8, 2v7, 3v6, 4v5 (standard seeding)', () => {
  const pairs = generateKnockoutFirstRound([1, 2, 3, 4, 5, 6, 7, 8])
  assert.deepEqual(pairs, [
    [1, 8],
    [2, 7],
    [3, 6],
    [4, 5],
  ])
})

test('knockout first round: 4 and 2 teams', () => {
  assert.deepEqual(generateKnockoutFirstRound([1, 2, 3, 4]), [
    [1, 4],
    [2, 3],
  ])
  assert.deepEqual(generateKnockoutFirstRound(['A', 'B']), [['A', 'B']])
})

test('knockout first round: unsupported size throws rather than guessing a bracket', () => {
  assert.throws(() => generateKnockoutFirstRound([1, 2, 3]))
  assert.throws(() => generateKnockoutFirstRound([1, 2, 3, 4, 5]))
  assert.deepEqual(SUPPORTED_KNOCKOUT_SIZES, [2, 4, 8])
})

test('nextRoundSlotPairing: 4 slots -> 2 pairs feeding slots 1 and 2; 2 slots -> 1 pair feeding slot 1', () => {
  assert.deepEqual(nextRoundSlotPairing(4), [
    { nextSlot: 1, slotA: 1, slotB: 2 },
    { nextSlot: 2, slotA: 3, slotB: 4 },
  ])
  assert.deepEqual(nextRoundSlotPairing(2), [{ nextSlot: 1, slotA: 1, slotB: 2 }])
})
