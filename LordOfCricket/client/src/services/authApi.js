import api from './api.js'

// Unified OTP login (email or phone) — the primary auth path. No token to
// manage client-side: the backend sets an HttpOnly session cookie on
// success, and the axios instance already sends it automatically
// (withCredentials: true in api.js) — nothing here reads or stores it.
export async function sendOtp(identifier) {
  const response = await api.post('/auth/send-otp', { identifier })
  return response.data
}

export async function verifyOtp(identifier, code) {
  const response = await api.post('/auth/verify-otp', { identifier, code })
  return response.data.user
}

export async function logout() {
  const response = await api.post('/auth/logout')
  return response.data
}

// Phase 8 — the legacy email+password `signup`/`login` wrappers were
// removed here along with the backend routes that backed them (see
// docs/AUTH.md's "Legacy JWT" section) — zero reachable UI callers existed.

// New Signup Flow — replaces the old registerPlayer/registerUmpire wrappers
// (removed here; the backend routes they called are kept but no longer
// have a frontend caller — see docs/AUTH.md). One send/verify pair reused
// for both email and phone: the backend auto-detects identifier type, same
// as every other identifier-driven auth call in this file.
export async function sendSignupCode(identifier) {
  const response = await api.post('/auth/signup/send-code', { identifier })
  return response.data
}

export async function verifySignupCode(identifier, code) {
  const response = await api.post('/auth/signup/verify-code', { identifier, code })
  return response.data
}

export async function createAccount(fields) {
  const response = await api.post('/auth/signup/create-account', fields)
  return response.data.user
}

// Auth Enhancement — the second credential type for the SAME unified login
// entry point above, not a second auth flow. Same no-token-to-manage shape
// as verifyOtp: the backend sets the identical HttpOnly session cookie.
export async function loginWithPassword(identifier, password) {
  const response = await api.post('/auth/login-password', { identifier, password })
  return response.data.user
}

export async function forgotPassword(identifier) {
  const response = await api.post('/auth/forgot-password', { identifier })
  return response.data
}

export async function resetPassword(identifier, code, newPassword, confirmPassword) {
  const response = await api.post('/auth/reset-password', { identifier, code, newPassword, confirmPassword })
  return response.data
}

// SUPER_ADMIN Identity & Secure Provisioning feature — self-service change
// password while already authenticated (distinct from forgot/reset-password
// above, which is the logged-out OTP flow). Backs both the mandatory
// force-password-change screen and a future "change my password" action
// from an authenticated account in general.
export async function changePassword(currentPassword, newPassword, confirmPassword) {
  const response = await api.post('/auth/change-password', { currentPassword, newPassword, confirmPassword })
  return response.data
}

// Phase 6 — now also returns `mfa: {enrolled, required, verified}` alongside
// the unchanged `user` shape every existing caller already relies on.
export async function fetchMe() {
  const response = await api.get('/auth/me')
  return response.data
}

export async function selectRole(role) {
  const response = await api.patch('/auth/role', { role })
  return response.data.user
}

export async function selectPlayerType(playerType) {
  const response = await api.patch('/auth/player-type', { playerType })
  return response.data.user
}
