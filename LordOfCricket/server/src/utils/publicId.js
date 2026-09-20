// Stable, non-sequential public-facing IDs (e.g. CVP-7K3QRT) so internal serial
// PKs never need to leak through APIs/URLs. Excludes visually ambiguous chars (0/O, 1/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generatePublicId(prefix, length = 6) {
  let suffix = ''
  for (let i = 0; i < length; i++) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return `${prefix}-${suffix}`
}
