import { useCallback, useEffect, useState } from 'react'
import {
  createMatchProposal,
  fetchGroundProposals,
  fetchProposalDetail,
  cancelMatchProposal,
  acceptMatchProposal,
} from '../services/matchProposalApi.js'

// Hook for match proposals: browsing OPEN proposals and accepting/creating them.
// Covers both proposer-side (create/cancel) and acceptor-side (accept) flows.
export function useMatchProposals(publicGroundId) {
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [details, setDetails] = useState({})

  const load = useCallback(async () => {
    if (!publicGroundId) return
    setLoading(true)
    setError('')
    try {
      const fetched = await fetchGroundProposals(publicGroundId)
      setProposals(fetched)
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to load proposals for this ground.')
    } finally {
      setLoading(false)
    }
  }, [publicGroundId])

  // Initial load on mount or when publicGroundId changes.
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const create = useCallback(
    async (payload) => {
      if (!publicGroundId) return false
      setCreating(true)
      setCreateError('')
      try {
        await createMatchProposal(publicGroundId, payload)
        await load()
        return true
      } catch (err) {
        setCreateError(err.response?.data?.message || err.response?.data?.error || 'Unable to create this proposal.')
        return false
      } finally {
        setCreating(false)
      }
    },
    [publicGroundId, load]
  )

  const fetchDetail = useCallback(async (publicProposalId) => {
    try {
      const detail = await fetchProposalDetail(publicProposalId)
      setDetails((prev) => ({ ...prev, [publicProposalId]: detail }))
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to load proposal details.')
    }
  }, [])

  const cancel = useCallback(
    async (publicProposalId) => {
      if (!publicGroundId) return false
      setBusyId(publicProposalId)
      setError('')
      try {
        await cancelMatchProposal(publicGroundId, publicProposalId)
        await load()
        return true
      } catch (err) {
        setError(err.response?.data?.message || err.response?.data?.error || 'Unable to cancel this proposal.')
        return false
      } finally {
        setBusyId(null)
      }
    },
    [publicGroundId, load]
  )

  const accept = useCallback(
    async (publicProposalId, payload) => {
      if (!publicGroundId) return false
      setBusyId(publicProposalId)
      setError('')
      try {
        const accepted = await acceptMatchProposal(publicGroundId, publicProposalId, payload)
        setDetails((prev) => ({ ...prev, [publicProposalId]: accepted }))
        await load()
        return true
      } catch (err) {
        // 409 conflicts (team already has this booking, player conflict, etc.) are not generic errors.
        const message = err.response?.data?.message || err.response?.data?.error || 'Unable to accept this proposal.'
        setError(message)
        return false
      } finally {
        setBusyId(null)
      }
    },
    [publicGroundId, load]
  )

  return { proposals, details, loading, error, creating, createError, busyId, load, create, fetchDetail, cancel, accept }
}
