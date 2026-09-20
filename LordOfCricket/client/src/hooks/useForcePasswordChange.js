import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth.js'

// SUPER_ADMIN Identity & Secure Provisioning feature — §4's flow diagram:
// Initial password -> MFA -> Force Password Change -> New password ->
// Admin Control Center. This is the "New password" step. Same
// state-machine-in-one-hook convention as useAuthPage.js/useSignupPage.js.
export function useForcePasswordChange() {
  const { changePassword } = useAuth()
  const navigate = useNavigate()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (newPassword === currentPassword) {
      setError('Your new password must be different from your current password.')
      return
    }
    setSubmitting(true)
    try {
      await changePassword(currentPassword, newPassword, confirmPassword)
      // Homepage, matching the platform-wide post-login convention
      // (getPostLoginPath) — this screen's whole purpose is to get out of
      // the way and let the account continue to wherever it was headed.
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.reason || 'Could not change your password. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return { currentPassword, setCurrentPassword, newPassword, setNewPassword, confirmPassword, setConfirmPassword, error, submitting, submit }
}
