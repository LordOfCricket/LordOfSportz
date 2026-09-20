import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth.js'
import { getPostAuthPath } from '../models/roleRedirect.model.js'

export function useRoleSelect() {
  const { user, selectRole } = useAuth()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const finish = async (role) => {
    setSubmitting(true)
    setError('')
    try {
      const updated = await selectRole(role)
      navigate(getPostAuthPath(updated), { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save your choice.')
      setSubmitting(false)
    }
  }

  const choosePlayer = () => finish('player')

  return {
    name: user?.name,
    submitting,
    error,
    choosePlayer,
  }
}
