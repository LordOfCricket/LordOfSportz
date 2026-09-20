import { useCallback, useEffect, useState } from 'react'
import { startRegistration } from '@simplewebauthn/browser'
import * as mfaApi from '../services/mfaApi.js'
import { useAuth } from './useAuth.js'
import { useStepUp } from './useStepUp.js'

// Phase 6 — all the mutation logic for the Security Settings page. Mirrors
// the server's own bootstrap-vs-step-up decision (mfaEnrollment.service.js#
// requireStepUpUnlessBootstrapping) by checking `status.enrolled` BEFORE
// attempting a WebAuthn/TOTP enrollment ceremony: if the user already has a
// factor, step-up must complete FIRST (a WebAuthn challenge is single-use,
// so it can't be generated before step-up and reused after — see
// docs/MFA.md). Every mutation still gets its real enforcement from the
// server regardless of what this hook decides to show.
export function useSecuritySettings() {
  const { refreshMfaStatus } = useAuth()
  const stepUp = useStepUp()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await mfaApi.fetchMfaStatus()
      setStatus(data)
    } catch {
      setError('Could not load your security settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Deferred via setTimeout(0), same as useGroundStaff.js's initial load —
    // `load` sets state synchronously as its first statement (setLoading),
    // which react-hooks/set-state-in-effect flags if called directly inside
    // the effect body.
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const runMutation = async (fn) => {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await fn()
      await load()
      await refreshMfaStatus()
    } catch (err) {
      if (err.message !== 'Step-up verification was cancelled.') {
        setError(err.response?.data?.error || err.response?.data?.message || 'That action could not be completed.')
      }
    } finally {
      setBusy(false)
    }
  }

  const addPasskey = () =>
    runMutation(async () => {
      if (status.enrolled) await stepUp.requestStepUp('WEBAUTHN_ADD')
      const optionsJSON = await mfaApi.webauthnRegisterOptions()
      const response = await startRegistration({ optionsJSON })
      await mfaApi.webauthnRegisterVerify(response)
      setNotice('Passkey added.')
    })

  const removePasskey = (credentialId) =>
    runMutation(async () => {
      await stepUp.requestStepUp('WEBAUTHN_REMOVE')
      await mfaApi.webauthnRemove(credentialId)
      setNotice('Passkey removed.')
    })

  const [totpEnrollment, setTotpEnrollment] = useState(null) // { qrDataUrl }

  const startTotpEnrollment = () =>
    runMutation(async () => {
      if (status.enrolled) await stepUp.requestStepUp('TOTP_ENABLE')
      const { qrDataUrl } = await mfaApi.totpEnroll()
      setTotpEnrollment({ qrDataUrl })
    })

  const confirmTotpEnrollment = (code) =>
    runMutation(async () => {
      await mfaApi.totpVerify(code)
      setTotpEnrollment(null)
      setNotice('Authenticator app enabled.')
    })

  const disableTotp = () =>
    runMutation(async () => {
      await stepUp.requestStepUp('TOTP_DISABLE')
      await mfaApi.totpDisable()
      setNotice('Authenticator app disabled.')
    })

  const regenerateRecoveryCodes = () =>
    runMutation(async () => {
      await stepUp.requestStepUp('RECOVERY_CODES_REGENERATE')
      const { codes } = await mfaApi.regenerateRecoveryCodes()
      setRecoveryCodes(codes)
      setNotice('New recovery codes generated — save them now, they will not be shown again.')
    })

  const disableMfaEntirely = () =>
    runMutation(async () => {
      await stepUp.requestStepUp('MFA_DISABLE')
      await mfaApi.disableMfaEntirely()
      setNotice('MFA has been disabled for this account.')
    })

  return {
    status,
    loading,
    busy,
    error,
    notice,
    recoveryCodes,
    dismissRecoveryCodes: () => setRecoveryCodes(null),
    totpEnrollment,
    cancelTotpEnrollment: () => setTotpEnrollment(null),
    addPasskey,
    removePasskey,
    startTotpEnrollment,
    confirmTotpEnrollment,
    disableTotp,
    regenerateRecoveryCodes,
    disableMfaEntirely,
    stepUpModal: stepUp.pending,
    submitStepUp: stepUp.handleSubmit,
    cancelStepUp: stepUp.handleCancel,
  }
}
