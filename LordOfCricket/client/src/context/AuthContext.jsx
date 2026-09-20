import { useCallback, useEffect, useState } from 'react'
import * as authApi from '../services/authApi.js'
import * as mfaApi from '../services/mfaApi.js'
import { fetchMyPlayer, updateMyPlayer, uploadMyPlayerPhoto } from '../services/playerApi.js'
import { AuthContext } from './authContext.js'

const DEFAULT_MFA = { enrolled: false, required: false, verified: false }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [player, setPlayer] = useState(null)
  // Phase 6 — server-authoritative MFA state for the current session. Never
  // trust anything about this beyond what /auth/me or a verify/step-up
  // response just returned; every actual privileged route independently
  // re-checks req.mfaVerified server-side regardless of what this says (see
  // docs/MFA.md) — this only drives UI (the RequireMfaVerified guard,
  // Security Settings page).
  const [mfa, setMfa] = useState(DEFAULT_MFA)
  // Always starts 'loading': the new session cookie is HttpOnly (invisible
  // to JS, unlike the old localStorage token), so there's no client-side
  // signal to skip the check — every mount asks the server via /auth/me,
  // which resolves quickly either way (200 authenticated, 401 not).
  const [status, setStatus] = useState('loading')

  const refreshPlayer = useCallback(async () => {
    try {
      const fetchedPlayer = await fetchMyPlayer()
      setPlayer(fetchedPlayer)
      return fetchedPlayer
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    authApi
      .fetchMe()
      .then(({ user: fetchedUser, mfa: fetchedMfa }) => {
        setUser(fetchedUser)
        setMfa(fetchedMfa || DEFAULT_MFA)
        setStatus('authenticated')
        if (fetchedUser?.role === 'player') refreshPlayer()
      })
      .catch(() => {
        setStatus('unauthenticated')
      })
  }, [refreshPlayer])

  // Phase 22.1 — services/api.js's response interceptor dispatches this the
  // moment any authenticated request 401s mid-session (expired/revoked
  // cookie). Resetting state here (the same fields logout() resets, minus
  // the redundant POST /auth/logout — the server has already invalidated
  // this session by definition) flips `status` to 'unauthenticated', which
  // RequireAuth.jsx already turns into a redirect to /login on its own —
  // reusing that existing guard rather than adding a second redirect path.
  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null)
      setPlayer(null)
      setMfa(DEFAULT_MFA)
      setStatus('unauthenticated')
    }
    window.addEventListener('loc:session-expired', handleSessionExpired)
    return () => window.removeEventListener('loc:session-expired', handleSessionExpired)
  }, [])

  // Re-fetches only the mfa key — used after enrollment/disable/verify so
  // the UI (RequireMfaVerified, Security Settings) reflects the server's
  // current view without a full page reload.
  const refreshMfaStatus = useCallback(async () => {
    try {
      const { mfa: fetchedMfa } = await authApi.fetchMe()
      setMfa(fetchedMfa || DEFAULT_MFA)
      return fetchedMfa
    } catch {
      return mfa
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Unified OTP login — the primary auth path. requestOtp just proxies the
  // call (nothing to store client-side yet); verifyOtp mirrors login/
  // signup's existing state-transition shape exactly (set user, set
  // status, conditionally refreshPlayer()) so every downstream consumer of
  // AuthContext behaves identically regardless of which method the user
  // signed in with.
  const requestOtp = async (identifier) => {
    return authApi.sendOtp(identifier)
  }

  const verifyOtp = async (identifier, code) => {
    const verifiedUser = await authApi.verifyOtp(identifier, code)
    setUser(verifiedUser)
    setStatus('authenticated')
    if (verifiedUser?.role === 'player') refreshPlayer()
    // A fresh OTP login always creates a brand-new session — mfa.verified
    // starts false regardless of what a previous session's state was.
    // enrolled/required need a real /auth/me read (they depend on the
    // resolved role/factors, not anything verifyOtp's own response carries).
    await refreshMfaStatus()
    return verifiedUser
  }

  // Auth Enhancement — the second credential type for the same unified
  // login. Deliberately mirrors verifyOtp above line for line: same state
  // transitions, same refreshMfaStatus call (a password-authenticated
  // session is a brand-new session too — mfa.verified starts false here for
  // the identical reason). Every downstream consumer of AuthContext (the
  // dashboard redirect, MFA gates, RequireAuth) behaves identically
  // regardless of which credential the user signed in with.
  const loginWithPassword = async (identifier, password) => {
    const loggedInUser = await authApi.loginWithPassword(identifier, password)
    setUser(loggedInUser)
    setStatus('authenticated')
    if (loggedInUser?.role === 'player') refreshPlayer()
    await refreshMfaStatus()
    return loggedInUser
  }

  // Forgot-password — neither call authenticates; AuthPage's own step
  // machine handles the identifier → OTP → new-password UI flow, this just
  // proxies the two requests (mirrors requestOtp's "nothing to store
  // client-side" shape).
  const forgotPassword = async (identifier) => {
    return authApi.forgotPassword(identifier)
  }

  const resetPassword = async (identifier, code, newPassword, confirmPassword) => {
    return authApi.resetPassword(identifier, code, newPassword, confirmPassword)
  }

  // New Signup Flow — none of these three authenticate on their own (no
  // session is created until the user logs in fresh afterward, matching
  // resetPassword's identical no-auto-login shape above) — nothing here
  // touches `user`/`status`.
  const sendSignupCode = async (identifier) => {
    return authApi.sendSignupCode(identifier)
  }

  const verifySignupCode = async (identifier, code) => {
    return authApi.verifySignupCode(identifier, code)
  }

  const createAccount = async (fields) => {
    return authApi.createAccount(fields)
  }

  // Revokes the server-side session. Clears local state unconditionally
  // even if the revoke call fails (e.g. offline) — the user's intent to
  // log out on this device should never get stuck behind a network error.
  const logout = async () => {
    try {
      await authApi.logout()
    } catch {
      // already logging out regardless — see comment above
    }
    setUser(null)
    setPlayer(null)
    setMfa(DEFAULT_MFA)
    setStatus('unauthenticated')
  }

  // Baseline MFA verification — proves an already-enrolled factor, unlocks
  // the privileged session (server sets sessions.mfa_verified_at). Never
  // enrolls a new factor. On success, re-reads /auth/me so `mfa.verified`
  // reflects the server's own freshness window, not an optimistic local flip.
  const verifyMfa = async (payload) => {
    await mfaApi.mfaVerify(payload)
    return refreshMfaStatus()
  }

  // Step-up — short-lived, single-use, scoped to one action. `startStepUp`
  // returns either { alreadyGranted: true } (a fresh grant already exists,
  // nothing further to do) or a real WebAuthn/TOTP challenge for the caller
  // to complete via completeStepUp. Never touches `mfa` state — a step-up
  // grant is a separate, per-action thing from the standing verified session.
  const startStepUp = async (actionScope) => {
    return mfaApi.stepUpOptions(actionScope)
  }

  const completeStepUp = async (actionScope, payload) => {
    return mfaApi.stepUpVerify(actionScope, payload)
  }

  const savePlayer = async (fields) => {
    const updated = await updateMyPlayer(fields)
    setPlayer(updated)
    return updated
  }

  const uploadPlayerPhoto = async (file) => {
    const updated = await uploadMyPlayerPhoto(file)
    setPlayer(updated)
    return updated
  }

  const selectRole = async (role) => {
    const updated = await authApi.selectRole(role)
    setUser(updated)
    return updated
  }

  const selectPlayerType = async (playerType) => {
    const updated = await authApi.selectPlayerType(playerType)
    setUser(updated)
    return updated
  }

  // SUPER_ADMIN Identity & Secure Provisioning feature — the endpoint
  // itself doesn't return a user object (see auth.routes.js/
  // passwordChange.controller.js — just a success message), so `user` is
  // updated locally (force_password_change is what
  // getPostLoginPath/ForcePasswordChangePage actually branch on) rather
  // than waiting on a second /auth/me round trip.
  const changePassword = async (currentPassword, newPassword, confirmPassword) => {
    const result = await authApi.changePassword(currentPassword, newPassword, confirmPassword)
    setUser((u) => (u ? { ...u, force_password_change: false } : u))
    return result
  }

  const value = {
    user,
    player,
    status,
    mfa,
    logout,
    selectRole,
    selectPlayerType,
    refreshPlayer,
    savePlayer,
    uploadPlayerPhoto,
    requestOtp,
    verifyOtp,
    loginWithPassword,
    forgotPassword,
    resetPassword,
    changePassword,
    sendSignupCode,
    verifySignupCode,
    createAccount,
    refreshMfaStatus,
    verifyMfa,
    startStepUp,
    completeStepUp,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
