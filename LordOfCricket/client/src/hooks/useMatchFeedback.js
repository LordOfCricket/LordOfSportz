import { useCallback, useEffect, useState } from 'react'
import { fetchFeedbackContext, submitMatchFeedback } from '../services/matchFeedbackApi.js'
import { feedbackErrorMessage } from '../models/matchFeedback.model.js'

export function useMatchFeedback(matchId) {
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setContext(await fetchFeedbackContext(matchId))
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Unable to load feedback for this match.')
    } finally {
      setLoading(false)
    }
  }, [matchId])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  // Match completion never depends on this — a failed/skipped submission
  // never blocks or alters anything about the match itself.
  const submit = async (payload) => {
    setSubmitting(true)
    setSubmitError('')
    try {
      await submitMatchFeedback(matchId, payload)
      setSubmitted(true)
      return true
    } catch (err) {
      setSubmitError(feedbackErrorMessage(err.response?.data?.code, err.response?.data?.error || err.response?.data?.message))
      return false
    } finally {
      setSubmitting(false)
    }
  }

  return { context, loading, error, submitting, submitError, submitted, submit, refresh: load }
}
