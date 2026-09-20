// Phase 24 — pure validation for a booking's team/player participant list.
// Never trusts the shape of client input (§36/§37): normalizes to a
// deduplicated list of positive integers, or throws a specific, honest
// error naming exactly what was wrong, before any DB lookup happens.

import { BookingError, BOOKING_ERROR_CODES } from './errors.js'

/** Normalizes a raw player-id list from a request body: rejects anything
 * that isn't a positive integer, and rejects duplicates outright (§37 —
 * never silently de-duplicate a client-submitted list, since that would
 * hide a bug/attack rather than surface it). */
export function normalizeParticipantIds(rawPlayerIds, { allowEmpty = false } = {}) {
  if (!Array.isArray(rawPlayerIds)) {
    throw new BookingError(BOOKING_ERROR_CODES.INVALID_SLOT, 'participantPlayerIds must be an array.')
  }
  const ids = rawPlayerIds.map((v) => Number(v))
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new BookingError(BOOKING_ERROR_CODES.INVALID_SLOT, 'Every participant id must be a positive integer.')
  }
  if (!allowEmpty && ids.length === 0) {
    throw new BookingError(BOOKING_ERROR_CODES.EMPTY_PARTICIPANTS, 'At least one participant is required.')
  }
  const seen = new Set()
  for (const id of ids) {
    if (seen.has(id)) {
      throw new BookingError(BOOKING_ERROR_CODES.DUPLICATE_PARTICIPANT, `Player ${id} was listed more than once.`)
    }
    seen.add(id)
  }
  return ids
}

/** Given the normalized id list and the real player rows fetched for them,
 * confirms every id actually resolved to a real player (§38 — never trust a
 * client-supplied id that merely looks plausible). Returns nothing; throws
 * PLAYER_NOT_FOUND naming the first missing id. */
export function assertPlayersExist(playerIds, foundPlayers) {
  const foundIds = new Set(foundPlayers.map((p) => p.id))
  const missing = playerIds.find((id) => !foundIds.has(id))
  if (missing != null) {
    throw new BookingError(BOOKING_ERROR_CODES.PLAYER_NOT_FOUND, `Player ${missing} was not found.`)
  }
}
