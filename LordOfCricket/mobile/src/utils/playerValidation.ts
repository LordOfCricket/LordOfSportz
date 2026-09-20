// Player profile validation utilities
// Rules extracted from server/src/controllers/player.controller.js
// All validation mirrors backend rules for consistency

import { PLAYING_ROLES, BATTING_STYLES, BOWLING_STYLES } from '../domain/playerEnums'
import { EditablePlayerFields } from '../types'

const MIN_BIRTH_YEAR = 1900

interface ValidationResult {
  valid: boolean
  errors: Record<string, string>
}

/**
 * Validate if a string is a valid date in YYYY-MM-DD format
 */
function isValidDateOnlyString(value: string): boolean {
  if (typeof value !== 'string') return false
  const match = /^\d{4}-\d{2}-\d{2}$/.test(value)
  if (!match) return false
  const timestamp = new Date(value).getTime()
  return !Number.isNaN(timestamp)
}

/**
 * Validate player name
 * - Required if provided
 * - Non-empty after trimming
 */
export function validateName(name: string | undefined): string | null {
  if (name === undefined) return null
  const trimmed = String(name).trim()
  if (!trimmed) return 'Name cannot be empty'
  return null
}

/**
 * Validate jersey number
 * - Must be integer 0-999 or null
 */
export function validateJerseyNumber(jerseyNumber: number | null | undefined): string | null {
  if (jerseyNumber === undefined || jerseyNumber === null) return null
  if (!Number.isInteger(jerseyNumber) || jerseyNumber < 0 || jerseyNumber > 999) {
    return 'Jersey number must be an integer between 0 and 999'
  }
  return null
}

/**
 * Validate playing role
 * - Must be one of PLAYING_ROLES or null
 */
export function validateRole(role: string | null | undefined): string | null {
  if (role === undefined || role === null) return null
  if (!PLAYING_ROLES.includes(role as any)) {
    return `Role must be one of: ${PLAYING_ROLES.join(', ')}`
  }
  return null
}

/**
 * Validate batting style
 * - Must be one of BATTING_STYLES or null
 */
export function validateBattingStyle(battingStyle: string | null | undefined): string | null {
  if (battingStyle === undefined || battingStyle === null) return null
  if (!BATTING_STYLES.includes(battingStyle as any)) {
    return `Batting style must be one of: ${BATTING_STYLES.join(', ')}`
  }
  return null
}

/**
 * Validate bowling style
 * - Must be one of BOWLING_STYLES or null
 */
export function validateBowlingStyle(bowlingStyle: string | null | undefined): string | null {
  if (bowlingStyle === undefined || bowlingStyle === null) return null
  if (!BOWLING_STYLES.includes(bowlingStyle as any)) {
    return `Bowling style must be one of: ${BOWLING_STYLES.join(', ')}`
  }
  return null
}

/**
 * Validate city
 * - Max 100 characters
 */
export function validateCity(city: string | null | undefined): string | null {
  if (city === undefined || city === null) return null
  const trimmed = String(city).trim()
  if (trimmed.length > 100) {
    return 'City must be 100 characters or less'
  }
  return null
}

/**
 * Validate bio
 * - Max 280 characters
 */
export function validateBio(bio: string | null | undefined): string | null {
  if (bio === undefined || bio === null) return null
  const trimmed = String(bio).trim()
  if (trimmed.length > 280) {
    return 'Bio must be 280 characters or less'
  }
  return null
}

/**
 * Validate nickname
 * - Max 50 characters
 */
export function validateNickname(nickname: string | null | undefined): string | null {
  if (nickname === undefined || nickname === null) return null
  const trimmed = String(nickname).trim()
  if (trimmed.length > 50) {
    return 'Nickname must be 50 characters or less'
  }
  return null
}

/**
 * Validate date of birth
 * - Must be YYYY-MM-DD format
 * - Cannot be in the future
 * - Must be after 1900
 */
export function validateDateOfBirth(dateOfBirth: string | null | undefined): string | null {
  if (dateOfBirth === undefined || dateOfBirth === null) return null
  
  if (!isValidDateOnlyString(dateOfBirth)) {
    return 'Date of birth must be in YYYY-MM-DD format'
  }
  
  const dob = new Date(dateOfBirth)
  if (dob.getTime() > Date.now()) {
    return 'Date of birth cannot be in the future'
  }
  
  if (dob.getUTCFullYear() < MIN_BIRTH_YEAR) {
    return `Date of birth must be after ${MIN_BIRTH_YEAR}`
  }
  
  return null
}

/**
 * Validate is_wicket_keeper
 * - Must be boolean
 */
export function validateIsWicketKeeper(isWicketKeeper: boolean | undefined): string | null {
  if (isWicketKeeper === undefined) return null
  if (typeof isWicketKeeper !== 'boolean') {
    return 'Wicket keeper must be true or false'
  }
  return null
}

/**
 * Validate address line
 * - Max 255 characters
 */
export function validateAddressLine(addressLine: string | null | undefined): string | null {
  if (addressLine === undefined || addressLine === null) return null
  const trimmed = String(addressLine).trim()
  if (trimmed.length > 255) {
    return 'Address must be 255 characters or less'
  }
  return null
}

/**
 * Validate state
 * - Max 100 characters
 */
export function validateState(state: string | null | undefined): string | null {
  if (state === undefined || state === null) return null
  const trimmed = String(state).trim()
  if (trimmed.length > 100) {
    return 'State must be 100 characters or less'
  }
  return null
}

/**
 * Validate postal code
 * - Max 20 characters
 */
export function validatePostalCode(postalCode: string | null | undefined): string | null {
  if (postalCode === undefined || postalCode === null) return null
  const trimmed = String(postalCode).trim()
  if (trimmed.length > 20) {
    return 'Postal code must be 20 characters or less'
  }
  return null
}

/**
 * Validate profile onboarding completed flag
 * - Must be boolean
 */
export function validateProfileOnboardingCompleted(
  profileOnboardingCompleted: boolean | undefined
): string | null {
  if (profileOnboardingCompleted === undefined) return null
  if (typeof profileOnboardingCompleted !== 'boolean') {
    return 'Profile onboarding completed must be true or false'
  }
  return null
}

/**
 * Validate all editable player fields
 * Returns validation result with any errors found
 */
export function validatePlayerFields(fields: EditablePlayerFields): ValidationResult {
  const errors: Record<string, string> = {}

  // Validate each field
  const nameError = validateName(fields.name)
  if (nameError) errors.name = nameError

  const jerseyError = validateJerseyNumber(fields.jersey_number)
  if (jerseyError) errors.jersey_number = jerseyError

  const roleError = validateRole(fields.role)
  if (roleError) errors.role = roleError

  const battingError = validateBattingStyle(fields.batting_style)
  if (battingError) errors.batting_style = battingError

  const bowlingError = validateBowlingStyle(fields.bowling_style)
  if (bowlingError) errors.bowling_style = bowlingError

  const cityError = validateCity(fields.city)
  if (cityError) errors.city = cityError

  const bioError = validateBio(fields.bio)
  if (bioError) errors.bio = bioError

  const nicknameError = validateNickname(fields.nickname)
  if (nicknameError) errors.nickname = nicknameError

  const dobError = validateDateOfBirth(fields.date_of_birth)
  if (dobError) errors.date_of_birth = dobError

  const wicketError = validateIsWicketKeeper(fields.is_wicket_keeper)
  if (wicketError) errors.is_wicket_keeper = wicketError

  const addressError = validateAddressLine(fields.address_line)
  if (addressError) errors.address_line = addressError

  const stateError = validateState(fields.state)
  if (stateError) errors.state = stateError

  const postalError = validatePostalCode(fields.postal_code)
  if (postalError) errors.postal_code = postalError

  const onboardingError = validateProfileOnboardingCompleted(fields.profile_onboarding_completed)
  if (onboardingError) errors.profile_onboarding_completed = onboardingError

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  }
}
