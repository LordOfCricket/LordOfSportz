// Pure fixture-generation math — no pg, no I/O, fully deterministic (Part 12
// non-negotiable: same input always produces the same output, never random).

/**
 * Deterministic single round-robin pairing via the standard "circle method":
 * one team held fixed, the rest rotate one position each round. Every pair
 * appears in exactly one round, exactly once, for both even and odd team
 * counts (an odd count is padded with a `null` BYE seat that never produces
 * a real pair — Part 12's "odd-team bye behavior").
 *
 * @param {Array} teamIds - team identifiers, in seed/registration order.
 * @returns {Array<Array<[id, id]>>} one entry per round, each an array of pairs.
 */
export function generateRoundRobinRounds(teamIds) {
  if (teamIds.length < 2) return []
  const ids = [...teamIds]
  if (ids.length % 2 !== 0) ids.push(null) // BYE seat
  const n = ids.length
  const rounds = []
  let arr = [...ids]

  for (let r = 0; r < n - 1; r++) {
    const pairs = []
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i]
      const b = arr[n - 1 - i]
      if (a !== null && b !== null) pairs.push([a, b])
    }
    rounds.push(pairs)
    // Rotate: seat 0 stays fixed, everything else shifts one position.
    const fixed = arr[0]
    const rest = arr.slice(1)
    rest.unshift(rest.pop())
    arr = [fixed, ...rest]
  }
  return rounds
}

export const SUPPORTED_KNOCKOUT_SIZES = Object.freeze([2, 4, 8])

/**
 * Standard "1 vs last" single-elimination seeding for the first knockout
 * round — deterministic, never random, and keeps top seeds apart as long as
 * possible. V1 only supports exact bracket sizes (Part 15 — "do not silently
 * generate impossible brackets"); anything else is a caller-side validation
 * error, not something this function guesses its way around.
 *
 * @param {Array} teamIds - in seed order.
 */
export function generateKnockoutFirstRound(teamIds) {
  const n = teamIds.length
  if (!SUPPORTED_KNOCKOUT_SIZES.includes(n)) {
    throw new Error(`Direct knockout only supports ${SUPPORTED_KNOCKOUT_SIZES.join(', ')} teams (got ${n}).`)
  }
  const pairs = []
  for (let i = 0; i < n / 2; i++) {
    pairs.push([teamIds[i], teamIds[n - 1 - i]])
  }
  return pairs
}

/**
 * Generic single-elimination progression: which two slots of the CURRENT
 * round feed which slot of the NEXT round. Slot numbers are 1-based bracket
 * positions (matches fixture_number/bracket_slot's schema — see schema.sql's
 * Phase 15 comment). Used for every knockout round after the first (Part
 * 32) — bracket geometry never repeated/hand-coded per stage.
 */
export function nextRoundSlotPairing(currentRoundSlotCount) {
  const pairs = []
  for (let i = 1; i <= currentRoundSlotCount; i += 2) {
    pairs.push({ nextSlot: Math.ceil(i / 2), slotA: i, slotB: i + 1 })
  }
  return pairs
}
