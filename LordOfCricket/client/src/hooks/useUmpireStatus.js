import { useEffect, useState } from 'react'
import { fetchMyUmpireRequest } from '../services/umpireApi.js'
import { useAuth } from './useAuth.js'

export function useUmpireStatus() {
  const { selectPlayerType } = useAuth()
  const [request, setRequest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [requesting, setRequesting] = useState(false)

  const load = () => {
    fetchMyUmpireRequest()
      .then(setRequest)
      .catch((err) => setError(err.response?.data?.message || 'Unable to load request status.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const requestAgain = async () => {
    setRequesting(true)
    setError('')
    try {
      await selectPlayerType('umpire')
      setLoading(true)
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to send request.')
    } finally {
      setRequesting(false)
    }
  }

  return { request, loading, error, requesting, requestAgain }
}
