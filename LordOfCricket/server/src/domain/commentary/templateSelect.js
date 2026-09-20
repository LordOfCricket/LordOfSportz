// Deterministic template variation (Part 14) — NEVER Math.random(). The same
// seed (a delivery/event id, which never changes once written — a
// correction patches a delivery's fields but keeps its id/log_sequence
// fixed) always selects the same template, so replaying/refreshing/
// regenerating commentary for an unchanged delivery is always byte-identical.

/** FNV-1a — a small, stable, non-cryptographic string hash. */
function stableHash(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** @param {string[]} templates @param {string|number} seed */
export function pickTemplate(templates, seed) {
  if (templates.length <= 1) return templates[0]
  return templates[stableHash(String(seed)) % templates.length]
}

export function fillTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => (vars[key] ?? '').toString())
}
