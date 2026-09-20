import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth.js'
import { getPostLoginPath } from '../models/roleRedirect.model.js'

export function usePlayerTypeSelect() {
  const { selectPlayerType } = useAuth()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const choose = async (playerType) => {
    setSubmitting(true)
    setError('')
    try {
      const updated = await selectPlayerType(playerType)
      // The last mandatory setup step — the account is now fully set up, so
      // this is the same "land on the homepage" moment a returning user's
      // login already gets. Never replaced, for the same back-navigation
      // reason as useAuthPage.js.
      navigate(getPostLoginPath(updated))
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save your choice.')
      setSubmitting(false)
    }
  }

  return { submitting, error, choose }
}
