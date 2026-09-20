// Single source of truth for match_events.event_type and wickets.dismissal_type.
// Keep the CHECK constraints in schema.sql in sync with these lists by hand —
// VARCHAR+CHECK was chosen over a Postgres ENUM specifically so new event kinds
// don't require an ALTER TYPE migration, but that means nothing enforces the
// two lists staying aligned except this comment and the eventTypes.test.js check.

export const EVENT_TYPES = Object.freeze([
  'batsman-in',
  'bowler-change',
  'strike-swap',
  'retire',
  'penalty-runs',
  'catch-dropped',
  'fielding-event',
  'appeal',
  'review',
  'drinks-break',
  'rain-delay',
  'injury',
  'match-paused',
  'match-resumed',
])

export const DISMISSAL_TYPES = Object.freeze([
  'bowled',
  'caught',
  'lbw',
  'run-out',
  'stumped',
  'hit-wicket',
  'obstructing-field',
  'hit-ball-twice',
  'timed-out',
  'retired-out',
])

// Dismissal types credited to the bowler's figures.
export const BOWLER_CREDITED_DISMISSALS = Object.freeze(['bowled', 'caught', 'lbw', 'stumped', 'hit-wicket'])

export const ILLEGAL_TYPES = Object.freeze(['wide', 'no-ball'])
export const EXTRA_TYPES = Object.freeze(['bye', 'leg-bye'])

export const INNINGS_STATUSES = Object.freeze(['not_started', 'live', 'paused', 'completed', 'declared', 'forfeited'])
