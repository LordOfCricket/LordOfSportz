// Utility functions for displaying player data
import { PlayingRole, BattingStyle, BowlingStyle } from '../domain/playerEnums'

/**
 * Format enum values to human-readable strings
 * Example: RIGHT_HAND → Right Hand
 */
export function formatEnumValue(value: string | null | undefined): string | null {
  if (!value) return null
  return value
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Format cricket role for display
 */
export function formatRole(role: string | PlayingRole | null | undefined): string | null {
  if (!role) return null
  const roleNames: Record<string, string> = {
    BATSMAN: 'Batsman',
    BOWLER: 'Bowler',
    ALL_ROUNDER: 'All Rounder',
    WICKET_KEEPER: 'Wicket Keeper',
    WICKET_KEEPER_BATSMAN: 'Wicket Keeper Batsman',
  }
  return roleNames[role] || formatEnumValue(role)
}

/**
 * Format batting style for display
 */
export function formatBattingStyle(style: string | BattingStyle | null | undefined): string | null {
  if (!style) return null
  const styleNames: Record<string, string> = {
    RIGHT_HAND: 'Right Hand',
    LEFT_HAND: 'Left Hand',
  }
  return styleNames[style] || formatEnumValue(style)
}

/**
 * Format bowling style for display
 */
export function formatBowlingStyle(style: string | BowlingStyle | null | undefined): string | null {
  if (!style) return null
  const styleNames: Record<string, string> = {
    RIGHT_ARM_FAST: 'Right Arm Fast',
    RIGHT_ARM_MEDIUM: 'Right Arm Medium',
    RIGHT_ARM_OFF_BREAK: 'Right Arm Off Break',
    RIGHT_ARM_LEG_BREAK: 'Right Arm Leg Break',
    LEFT_ARM_FAST: 'Left Arm Fast',
    LEFT_ARM_MEDIUM: 'Left Arm Medium',
    LEFT_ARM_ORTHODOX: 'Left Arm Orthodox',
    LEFT_ARM_WRIST_SPIN: 'Left Arm Wrist Spin',
    NONE: 'None',
  }
  return styleNames[style] || formatEnumValue(style)
}

/**
 * Format date string for display
 * Input: YYYY-MM-DD (or a naive-timestamp string like
 * "2026-08-20T00:00:00.000Z" — see the parsing note below)
 * Output: Jan 1, 2000
 *
 * QA fix: this used to do `new Date(dateString).toLocaleDateString(...)`
 * with no `timeZone` option. For a pure date-only string, the JS spec
 * parses it as UTC midnight; `toLocaleDateString` then renders it in the
 * DEVICE's own local timezone, which silently shows the PREVIOUS calendar
 * day for anyone on a negative UTC offset (all of the Americas). The same
 * bug applied to PlayerMatchPerformance.date, a naive `TIMESTAMP WITHOUT
 * TIME ZONE` value whose digits are already ground-local (see server/src/
 * domain/shared/groundTime.js) — reusing the shared statsRange.ts finding.
 * Fix: parse the literal YYYY-MM-DD digits directly and build the Date via
 * the local-time numeric constructor (`new Date(y, m-1, d)`), which never
 * round-trips through UTC, so the calendar day rendered is always exactly
 * the day encoded in the string, regardless of device timezone.
 */
export function formatDate(dateString: string | null | undefined): string | null {
  if (!dateString) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString)
  if (!match) return null
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Calculate age from date of birth.
 * QA fix: same UTC-round-trip bug as formatDate above — `new
 * Date(dateOfBirth)` anchored the birth date at UTC midnight, then
 * `.getFullYear()/.getMonth()/.getDate()` (local getters) could read back
 * the wrong calendar day on a negative-UTC-offset device, occasionally
 * shifting the computed age by a year right around the birthday. Parsing
 * the digits directly and building via the local numeric constructor
 * avoids the round-trip entirely.
 */
export function calculateAge(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth)
  if (!match) return null
  const [, year, month, day] = match
  const birthDate = new Date(Number(year), Number(month) - 1, Number(day))
  if (Number.isNaN(birthDate.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  return age >= 0 ? age : null
}

/**
 * Format statistics values with appropriate decimals
 */
export function formatStatValue(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-'
  if (Number.isInteger(value)) return value.toString()
  return value.toFixed(2)
}
