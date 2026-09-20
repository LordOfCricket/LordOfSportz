import api from './api.js'

// Phase 6 — Privileged Account MFA & Step-Up Security. Every call here
// relies on the existing session cookie (withCredentials, api.js) — nothing
// about MFA/step-up state is ever stored client-side beyond what the server
// returns for the current request; see docs/MFA.md.

export async function fetchMfaStatus() {
  const response = await api.get('/auth/mfa/status')
  return response.data
}

export async function webauthnRegisterOptions() {
  const response = await api.post('/auth/mfa/webauthn/register/options')
  return response.data
}

export async function webauthnRegisterVerify(webauthnResponse, deviceName) {
  const response = await api.post('/auth/mfa/webauthn/register/verify', { response: webauthnResponse, deviceName })
  return response.data
}

export async function webauthnRemove(credentialId) {
  const response = await api.delete(`/auth/mfa/webauthn/${credentialId}`)
  return response.data
}

export async function totpEnroll() {
  const response = await api.post('/auth/mfa/totp/enroll')
  return response.data
}

export async function totpVerify(code) {
  const response = await api.post('/auth/mfa/totp/verify', { code })
  return response.data
}

export async function totpDisable() {
  const response = await api.post('/auth/mfa/totp/disable')
  return response.data
}

export async function regenerateRecoveryCodes() {
  const response = await api.post('/auth/mfa/recovery-codes/regenerate')
  return response.data
}

export async function disableMfaEntirely() {
  const response = await api.post('/auth/mfa/disable')
  return response.data
}

// Returns the raw WebAuthn options object, or null if this user has no
// enrolled passkey (a legitimate TOTP-only configuration — see
// mfaVerification.service.js#tryGenerateAuthenticationChallenge).
export async function mfaVerifyOptions() {
  const response = await api.post('/auth/mfa/verify/options')
  return response.data.challenge
}

export async function mfaVerify({ method, response: webauthnResponse, code }) {
  const response = await api.post('/auth/mfa/verify', { method, response: webauthnResponse, code })
  return response.data
}

export async function stepUpOptions(actionScope) {
  const response = await api.post('/auth/step-up/options', { actionScope })
  return response.data
}

export async function stepUpVerify(actionScope, { method, response: webauthnResponse, code }) {
  const response = await api.post('/auth/step-up/verify', { actionScope, method, response: webauthnResponse, code })
  return response.data
}
