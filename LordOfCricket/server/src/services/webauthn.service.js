import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import { getRpId, getRpName, getExpectedOrigins, getChallengeTtlMs } from '../config/webauthn.js'
import { createChallenge, consumeChallenge } from '../models/webauthnChallenge.model.js'
import {
  findActiveCredentialsForUser,
  findActiveCredentialByCredentialId,
  findCredentialById,
  createCredential,
  updateCounterAndLastUsed,
  revokeCredential as revokeCredentialRow,
} from '../models/webauthnCredential.model.js'
import { MfaError, MFA_ERROR_CODES as CODES } from '../domain/mfa/errors.js'
import { isCounterRollback } from '../domain/mfa/counterRollback.js'
import { logger } from '../utils/logger.js'

// Phase 6 — all @simplewebauthn/server interaction lives here, isolated
// from controllers/routes per the brief's "WebAuthn logic isolated" code
// quality requirement. Zero manual cryptography — every signature/challenge/
// origin/RP-ID check is delegated to the library.

export async function generateRegistrationChallenge(user) {
  const existing = await findActiveCredentialsForUser(user.id)

  const options = await generateRegistrationOptions({
    rpName: getRpName(),
    rpID: getRpId(),
    userName: user.email || user.phone || String(user.id),
    userID: Buffer.from(String(user.id)),
    userDisplayName: user.name,
    attestationType: 'none',
    // Already-registered credentials are excluded so the browser won't let
    // the same authenticator be registered twice for this user.
    excludeCredentials: existing.map((c) => ({ id: c.credential_id, transports: c.transports || undefined })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  })

  await createChallenge({
    userId: user.id,
    challenge: options.challenge,
    purpose: 'REGISTRATION',
    expiresAt: new Date(Date.now() + getChallengeTtlMs()),
  })

  return options
}

// `response` is exactly what @simplewebauthn/browser#startRegistration
// returns. Never accepts a userId from the client — the challenge lookup is
// keyed on `user.id` from the authenticated session, not anything in the
// request body.
export async function verifyRegistration(user, response, deviceName) {
  const challengeRow = await consumeChallenge({ userId: user.id, purpose: 'REGISTRATION' })
  if (!challengeRow) {
    throw new MfaError(CODES.CHALLENGE_INVALID, 'This registration challenge has expired or was already used. Please try again.')
  }

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: getExpectedOrigins(),
      expectedRPID: getRpId(),
    })
  } catch (err) {
    logger.warn('WebAuthn registration verification threw', { userId: user.id, error: err.message })
    throw new MfaError(CODES.VERIFICATION_FAILED, 'Could not verify this passkey. Please try again.')
  }

  if (!verification.verified || !verification.registrationInfo) {
    throw new MfaError(CODES.VERIFICATION_FAILED, 'Could not verify this passkey. Please try again.')
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
  const saved = await createCredential({
    userId: user.id,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey),
    counter: credential.counter,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    transports: credential.transports || null,
    deviceName: deviceName || 'Passkey',
  })

  return saved
}

export async function generateAuthenticationChallenge(user) {
  const existing = await findActiveCredentialsForUser(user.id)
  if (existing.length === 0) {
    throw new MfaError(CODES.CREDENTIAL_NOT_FOUND, 'No passkey is registered for this account.')
  }

  const options = await generateAuthenticationOptions({
    rpID: getRpId(),
    allowCredentials: existing.map((c) => ({ id: c.credential_id, transports: c.transports || undefined })),
    userVerification: 'preferred',
  })

  await createChallenge({
    userId: user.id,
    challenge: options.challenge,
    purpose: 'AUTHENTICATION',
    expiresAt: new Date(Date.now() + getChallengeTtlMs()),
  })

  return options
}

// Rejects on counter rollback (a lower-or-equal counter than what's stored
// strongly suggests a cloned authenticator/credential replay — the one
// documented exception is when BOTH are zero, which some authenticators
// legitimately never increment past). This is an active rejection, not a
// passive log-only observation.
export async function verifyAuthentication(user, response) {
  const challengeRow = await consumeChallenge({ userId: user.id, purpose: 'AUTHENTICATION' })
  if (!challengeRow) {
    throw new MfaError(CODES.CHALLENGE_INVALID, 'This authentication challenge has expired or was already used. Please try again.')
  }

  const credentialRow = await findActiveCredentialByCredentialId(response.id)
  if (!credentialRow || credentialRow.user_id !== user.id) {
    // Same generic error regardless of "credential doesn't exist" vs
    // "belongs to someone else" — never confirm which to the caller.
    throw new MfaError(CODES.VERIFICATION_FAILED, 'Could not verify this passkey. Please try again.')
  }

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: getExpectedOrigins(),
      expectedRPID: getRpId(),
      credential: {
        id: credentialRow.credential_id,
        publicKey: credentialRow.public_key,
        counter: Number(credentialRow.counter),
        transports: credentialRow.transports || undefined,
      },
    })
  } catch (err) {
    logger.warn('WebAuthn authentication verification threw', { userId: user.id, error: err.message })
    throw new MfaError(CODES.VERIFICATION_FAILED, 'Could not verify this passkey. Please try again.')
  }

  const newCounter = verification.authenticationInfo?.newCounter ?? 0
  const storedCounter = Number(credentialRow.counter)

  if (!verification.verified) {
    throw new MfaError(CODES.VERIFICATION_FAILED, 'Could not verify this passkey. Please try again.')
  }
  if (isCounterRollback(storedCounter, newCounter)) {
    logger.warn('WebAuthn counter rollback detected — possible cloned credential', {
      userId: user.id,
      credentialId: credentialRow.id,
      storedCounter,
      newCounter,
    })
    throw new MfaError(CODES.VERIFICATION_FAILED, 'Could not verify this passkey. Please try again.')
  }

  await updateCounterAndLastUsed(credentialRow.id, newCounter)
  return credentialRow
}

export async function listCredentialsForUser(userId) {
  const rows = await findActiveCredentialsForUser(userId)
  return rows.map((row) => ({
    id: row.id,
    deviceName: row.device_name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    transports: row.transports,
  }))
}

// Ownership check lives here, not the controller — a credential id is only
// ever resolved against the AUTHENTICATED user's own rows.
export async function revokeCredentialForUser(userId, credentialRowId, client) {
  const credential = await findCredentialById(credentialRowId)
  if (!credential || credential.user_id !== userId || credential.revoked_at) {
    throw new MfaError(CODES.CREDENTIAL_NOT_FOUND, 'Passkey not found.')
  }
  return revokeCredentialRow(credentialRowId, client)
}
