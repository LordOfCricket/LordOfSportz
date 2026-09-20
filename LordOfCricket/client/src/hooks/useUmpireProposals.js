import { useCallback, useEffect, useState } from 'react'
import { fetchMyProposals, respondToProposal } from '../services/umpireProposalApi.js'

// Umpire Proposals — the umpire's own inbox of offers a Ground Owner has
// sent them directly, mirroring useUmpireEarnings.js's shape (load once,
// expose a refresh, keep a per-item busy id so two rows never share a
// spinner).
export function useUmpireProposals() {
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState('')

  const load = useCallback(async () => {
    try {
      setProposals(await fetchMyProposals())
      setError('')
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to load your proposals.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const respond = async (proposalId, accept) => {
    setBusyId(proposalId)
    setActionError('')
    try {
      await respondToProposal(proposalId, accept)
      await load()
      return true
    } catch (err) {
      setActionError(err.response?.data?.message || err.response?.data?.error || 'Unable to respond to this proposal.')
      return false
    } finally {
      setBusyId(null)
    }
  }

  return { proposals, loading, error, refresh: load, respond, busyId, actionError }
}
