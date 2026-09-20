// Single source of truth for players.role / batting_style / bowling_style.
// VARCHAR (no CHECK constraint) — same tradeoff as eventTypes.js — because
// existing roster rows predate this enum (e.g. fixtures seed 'Batter'/'Bowler')
// and a CHECK would reject them. New self-service writes are validated against
// these lists at the controller layer instead.

export const PLAYING_ROLES = Object.freeze([
  'BATSMAN',
  'BOWLER',
  'ALL_ROUNDER',
  'WICKET_KEEPER',
  'WICKET_KEEPER_BATSMAN',
])

export const BATTING_STYLES = Object.freeze(['RIGHT_HAND', 'LEFT_HAND'])

export const BOWLING_STYLES = Object.freeze([
  'RIGHT_ARM_FAST',
  'RIGHT_ARM_MEDIUM',
  'RIGHT_ARM_OFF_BREAK',
  'RIGHT_ARM_LEG_BREAK',
  'LEFT_ARM_FAST',
  'LEFT_ARM_MEDIUM',
  'LEFT_ARM_ORTHODOX',
  'LEFT_ARM_WRIST_SPIN',
  'NONE',
])
