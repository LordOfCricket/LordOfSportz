import { useState } from 'react'
import { createStaff } from '../services/staffApi.js'
import { MIN_PASSWORD_LENGTH } from '../models/auth.model.js'
import { useStepUp } from './useStepUp.js'

const EMPTY_FORM = { name: '', email: '', password: '', staffId: '', role: 'admin' }

// Phase 6 — creating a platform staff account is step-up-gated server-side
// (STAFF_CREATE — docs/MFA.md).
export function useCreateStaff() {
  const stepUp = useStepUp()
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const setField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccessMessage('')

    if (!form.name || !form.email || !form.password) {
      setError('Name, email and password are required.')
      return
    }
    if (form.password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }

    setSubmitting(true)
    try {
      await stepUp.requestStepUp('STAFF_CREATE')
      const created = await createStaff({
        name: form.name,
        email: form.email,
        password: form.password,
        staffId: form.staffId || undefined,
        role: form.role,
      })
      setSuccessMessage(`Staff account created for ${created.name} (${created.role === 'staff' ? form.role : created.role}).`)
      setForm(EMPTY_FORM)
    } catch (err) {
      if (err.message !== 'Step-up verification was cancelled.') {
        setError(err.response?.data?.error || err.response?.data?.message || 'Unable to create staff account.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return {
    form,
    setField,
    handleSubmit,
    submitting,
    error,
    successMessage,
    stepUpModal: stepUp.pending,
    submitStepUp: stepUp.handleSubmit,
    cancelStepUp: stepUp.handleCancel,
  }
}
