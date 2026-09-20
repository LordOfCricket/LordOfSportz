// Auction money handling. Every monetary column is NUMERIC(12,2) in Postgres
// and arrives as a Prisma Decimal or a string — never a JS number, because
// float arithmetic on a purse silently loses paise.
//
// These helpers convert to integer paise for comparison/arithmetic so no
// rounding error can ever enter a bid or purse calculation.

export const MAX_AMOUNT = 9999999999.99

// Parses user-supplied or DB-supplied money into integer paise.
// Returns null for anything that is not a valid, finite, non-negative amount
// with at most 2 decimal places — callers treat null as a validation failure
// rather than coercing a bad value into a number.
export function toPaise(value) {
  if (value === null || value === undefined) return null

  const raw = typeof value === 'object' && typeof value.toString === 'function'
    ? value.toString()
    : value

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    return toPaise(raw.toFixed(2))
  }
  if (typeof raw !== 'string') return null

  const trimmed = raw.trim()
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(trimmed)) return null

  const [whole, fraction = ''] = trimmed.split('.')
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(paise) ? paise : null
}

export function fromPaise(paise) {
  const sign = paise < 0 ? '-' : ''
  const abs = Math.abs(paise)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

export function isValidAmount(value) {
  const paise = toPaise(value)
  return paise !== null && paise > 0 && paise <= MAX_AMOUNT * 100
}

// remaining = initial - spent, in paise. Returns null if either input is
// unparseable, so a caller can never mistake a parse failure for a zero purse.
export function remainingPurse(initialPurse, currentSpent) {
  const initial = toPaise(initialPurse)
  const spent = toPaise(currentSpent)
  if (initial === null || spent === null) return null
  return initial - spent
}
