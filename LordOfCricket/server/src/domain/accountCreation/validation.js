// Phase 4 — pure validation helpers shared by player/umpire registration,
// ground-owner-request submission, and ground-scoped staff creation. Same
// "trim + required + maxLength" shape ground.controller.js's existing
// registerGround already used — generalized here so it isn't duplicated
// per flow, and so it's independently unit-testable like every other
// domain/* module.

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const PHONE_PATTERN = /^\+?[0-9]{8,15}$/

export function requiredText(value, maxLength) {
  if (typeof value !== 'string') return { error: true }
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return { error: true }
  return { value: trimmed }
}

export function optionalText(value, maxLength) {
  if (value === undefined || value === null || value === '') return { value: null }
  if (typeof value !== 'string') return { error: true }
  const trimmed = value.trim()
  if (trimmed.length > maxLength) return { error: true }
  return { value: trimmed || null }
}

export function validateEmail(value) {
  const result = optionalText(value, 150)
  if (result.error) return result
  if (result.value && !EMAIL_PATTERN.test(result.value)) return { error: true }
  return result
}

export function validatePhone(value) {
  const result = optionalText(value, 20)
  if (result.error) return result
  if (result.value && !PHONE_PATTERN.test(result.value.replace(/[^\d+]/g, ''))) return { error: true }
  return { value: result.value ? result.value.replace(/[^\d+]/g, '') : null }
}

// Player/Umpire registration and Ground-Owner-created Staff all take "name +
// one identifier (email or phone)" — this is the one shared shape, kept
// separate from the OTP domain's own detectIdentifierType/normalizeIdentifier
// (domain/otpAuth/otp.js) since that module already owns identifier parsing
// for the login/verify path; this only validates the two raw fields the
// registration forms collect before an OTP is ever requested.
// Phase 7 — the "add image by URL" endpoints (ground photos, amenities)
// stored req.body.imageUrl verbatim with only a truthiness check. Scheme
// allow-listing rules out a persisted javascript:/data: URI ever reaching an
// <a href> or similar non-<img> sink later, even though no such sink exists
// today — cheap defense-in-depth for a value that's stored, not executed.
export function isValidHttpUrl(value) {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function validateNameAndIdentifier(name, identifier) {
  const nameResult = requiredText(name, 100)
  if (nameResult.error) return { error: true, field: 'name' }

  const trimmedIdentifier = typeof identifier === 'string' ? identifier.trim() : ''
  if (!trimmedIdentifier) return { error: true, field: 'identifier' }

  return { value: { name: nameResult.value, identifier: trimmedIdentifier } }
}
