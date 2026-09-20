import api from './api'
import { User, AuthResponse } from '../types'

// DEVELOPMENT-ONLY OTP BYPASS
// This should NEVER be enabled in production
// Used for testing without depending on SMS service
const DEV_OTP_CODE = '123456'
// Fail closed: the OTP bypass activates ONLY in a debug build (__DEV__) whose
// env is explicitly 'development'. A release binary always has __DEV__ === false,
// so a mis-set EXPO_PUBLIC_APP_ENV can never enable the bypass in production.
const isDevelopment = __DEV__ && process.env.EXPO_PUBLIC_APP_ENV === 'development'

// Entering the dev OTP code logs into a REAL, already-seeded account via
// the existing /auth/login-password endpoint — a real signed session, a
// real users.id, a real players row. All five seeded accounts
// (server/src/scripts/seedTestingEnvironment.js) share this one password,
// so the identifier the user typed on the login screen selects WHICH
// account (player, umpire, staff, …). Falling back to the seeded player
// only when the field is left blank keeps the "just tap through" flow.
// No new auth mechanism — same endpoint the password login screen uses.
const DEV_FALLBACK_IDENTIFIER = 'player@gmail.com'
const DEV_TEST_PASSWORD = 'LocTester#2026'

export async function sendOtp(identifier: string) {
  // DEVELOPMENT-ONLY: Skip SMS service in development
  if (isDevelopment) {
    // Simulate API response without calling real SMS provider
    return { success: true, message: 'OTP sent (development mode)' }
  }

  // PRODUCTION: Use real OTP service
  const response = await api.post('/auth/send-otp', { identifier })
  return response.data
}

export async function verifyOtp(identifier: string, code: string): Promise<User> {
  // DEVELOPMENT-ONLY: accept the dev OTP and log into the seeded account
  // matching the identifier the user actually entered (blank → the seeded
  // player). Previously this ignored `identifier` and always logged into
  // the player account, so switching accounts after logout re-opened the
  // previous one.
  if (isDevelopment && code === DEV_OTP_CODE) {
    return loginWithPassword(identifier?.trim() || DEV_FALLBACK_IDENTIFIER, DEV_TEST_PASSWORD)
  }

  // PRODUCTION: Verify real OTP only
  const response = await api.post<AuthResponse>('/auth/verify-otp', { identifier, code })
  return response.data.user
}

export function getDevOtpCode(): string | null {
  return isDevelopment ? DEV_OTP_CODE : null
}

export async function logout() {
  const response = await api.post('/auth/logout')
  return response.data
}

export async function loginWithPassword(identifier: string, password: string): Promise<User> {
  const response = await api.post<AuthResponse>('/auth/login-password', {
    identifier,
    password,
  })
  return response.data.user
}

export async function forgotPassword(identifier: string) {
  const response = await api.post('/auth/forgot-password', { identifier })
  return response.data
}

export async function resetPassword(
  identifier: string,
  code: string,
  newPassword: string,
  confirmPassword: string
) {
  const response = await api.post('/auth/reset-password', {
    identifier,
    code,
    newPassword,
    confirmPassword,
  })
  return response.data
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
) {
  const response = await api.post('/auth/change-password', {
    currentPassword,
    newPassword,
    confirmPassword,
  })
  return response.data
}

export async function fetchMe(): Promise<AuthResponse> {
  const response = await api.get<AuthResponse>('/auth/me')
  return response.data
}

export async function selectRole(role: 'player' | 'staff'): Promise<User> {
  const response = await api.patch<{ user: User }>('/auth/role', { role })
  return response.data.user
}

export async function selectPlayerType(playerType: 'team_player' | 'umpire'): Promise<User> {
  const response = await api.patch<{ user: User }>('/auth/player-type', { playerType })
  return response.data.user
}

export async function signupSendCode(identifier: string) {
  const response = await api.post('/auth/signup/send-code', { identifier })
  return response.data
}

export async function signupVerifyCode(identifier: string, code: string) {
  const response = await api.post('/auth/signup/verify-code', { identifier, code })
  return response.data
}

export interface SignupCreateAccountPayload {
  firstName: string
  middleName: string
  lastName: string
  accountType: 'PLAYER' | 'UMPIRE'
  email: string
  phone: string
  password: string
  confirmPassword: string
}

export async function signupCreateAccount(payload: SignupCreateAccountPayload): Promise<User> {
  const response = await api.post<{ user: User }>('/auth/signup/create-account', payload)
  return response.data.user
}
