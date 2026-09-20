// Extracted directly from server/src/domain/player/playerEnums.js
// These must remain synchronized with backend values

export const PLAYING_ROLES = ['BATSMAN', 'BOWLER', 'ALL_ROUNDER', 'WICKET_KEEPER', 'WICKET_KEEPER_BATSMAN'] as const

export const BATTING_STYLES = ['RIGHT_HAND', 'LEFT_HAND'] as const

export const BOWLING_STYLES = [
  'RIGHT_ARM_FAST',
  'RIGHT_ARM_MEDIUM',
  'RIGHT_ARM_OFF_BREAK',
  'RIGHT_ARM_LEG_BREAK',
  'LEFT_ARM_FAST',
  'LEFT_ARM_MEDIUM',
  'LEFT_ARM_ORTHODOX',
  'LEFT_ARM_WRIST_SPIN',
  'NONE',
] as const

export type PlayingRole = (typeof PLAYING_ROLES)[number]
export type BattingStyle = (typeof BATTING_STYLES)[number]
export type BowlingStyle = (typeof BOWLING_STYLES)[number]
