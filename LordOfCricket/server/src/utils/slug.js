// Phase 8 — the first slug utility in this codebase (audited first: no
// existing slug logic anywhere to reuse). Lowercase, hyphenated,
// ASCII-only. Collision handling (e.g. "greenfield-ground" ->
// "greenfield-ground-2") is the caller's responsibility, matching the
// Phase 7 audit's recommendation — this function only turns text into a
// candidate slug, it never queries the database.
export function slugify(text) {
  return text
    .toString()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents (after NFKD decomposition)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
