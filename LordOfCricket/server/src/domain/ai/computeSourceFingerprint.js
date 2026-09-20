// Phase 16 Part 22/23 — ties a cached AI insight to the exact authoritative
// state it was generated from. A correction bumps `innings.version` (the
// existing optimistic-concurrency counter every scoring write already
// maintains — see schema.sql's Phase 3 comment) even when, rarely, final
// totals happen to end up unchanged, so keying the fingerprint on version
// numbers (not just final totals) is the conservative, correct choice: it
// can never under-invalidate. Pure — no I/O, no Date.now(), no randomness;
// the same authoritative facts always hash to the same fingerprint.

import { createHash } from 'crypto'

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
}

export function computeSourceFingerprint(facts) {
  return createHash('sha256').update(stableStringify(facts)).digest('hex')
}
