import { useState } from 'react'
import {
  fetchGroundMatchUmpireSlots,
  markUmpireNoShow,
  assignReplacementUmpire,
  setGroundMatchUmpireFee,
  updateGroundMatchSlotPaymentStatus,
} from '../services/groundOwnerApi.js'
import { proposeUmpireForSlot, fetchMatchProposals, cancelMatchProposal } from '../services/umpireProposalApi.js'

// Lazy, on-demand fetch of one match's per-slot umpire detail, properly
// scoped to the owner of the match's own ground (requireGroundRole
// server-side) — not called for every match card on page load, only when
// the Ground Owner actually expands one.
export function useMatchUmpireSlots(publicGroundId) {
  const [slotsByMatch, setSlotsByMatch] = useState({})
  const [umpireFeeByMatch, setUmpireFeeByMatch] = useState({})
  const [loadingId, setLoadingId] = useState(null)
  const [error, setError] = useState('')
  // Workstreams F/G — no-show/replacement actions, keyed by
  // slotId so two different slots' buttons never show the same spinner.
  const [actionBusyId, setActionBusyId] = useState(null)
  const [actionError, setActionError] = useState('')
  // Umpire Proposals — pending/expired/etc. offers sent for a match, keyed
  // by matchId, loaded lazily alongside the slot detail it annotates.
  const [proposalsByMatch, setProposalsByMatch] = useState({})

  const load = async (matchId, { force = false } = {}) => {
    if (slotsByMatch[matchId] && !force) return
    setLoadingId(matchId)
    setError('')
    try {
      const { slots, umpireFee } = await fetchGroundMatchUmpireSlots(publicGroundId, matchId)
      setSlotsByMatch((prev) => ({ ...prev, [matchId]: slots }))
      setUmpireFeeByMatch((prev) => ({ ...prev, [matchId]: umpireFee }))
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Unable to load umpire status for this match.')
    } finally {
      setLoadingId(null)
    }
  }

  // Umpire Communication & Commercial 2.0 — fee + payment status.
  const setFee = async (matchId, { amount, currency }) => {
    setActionBusyId(`fee-${matchId}`)
    setActionError('')
    try {
      await setGroundMatchUmpireFee(publicGroundId, matchId, { amount, currency })
      await load(matchId, { force: true })
      return true
    } catch (err) {
      setActionError(err.response?.data?.message || err.response?.data?.error || 'Unable to set the umpire fee.')
      return false
    } finally {
      setActionBusyId(null)
    }
  }

  const updatePaymentStatus = async (matchId, slotId, status) => {
    setActionBusyId(slotId)
    setActionError('')
    try {
      await updateGroundMatchSlotPaymentStatus(publicGroundId, matchId, slotId, status)
      await load(matchId, { force: true })
      return true
    } catch (err) {
      setActionError(err.response?.data?.message || err.response?.data?.error || 'Unable to update the payment status.')
      return false
    } finally {
      setActionBusyId(null)
    }
  }

  const markNoShow = async (matchId, slotId) => {
    setActionBusyId(slotId)
    setActionError('')
    try {
      await markUmpireNoShow(publicGroundId, matchId, slotId)
      await load(matchId, { force: true })
      return true
    } catch (err) {
      setActionError(err.response?.data?.message || err.response?.data?.error || 'Unable to mark this umpire as a no-show.')
      return false
    } finally {
      setActionBusyId(null)
    }
  }

  const assignReplacement = async (matchId, slotId, newUmpireUserId) => {
    setActionBusyId(slotId)
    setActionError('')
    try {
      await assignReplacementUmpire(publicGroundId, matchId, slotId, newUmpireUserId)
      await load(matchId, { force: true })
      return true
    } catch (err) {
      setActionError(err.response?.data?.message || err.response?.data?.error || 'Unable to assign the replacement umpire.')
      return false
    } finally {
      setActionBusyId(null)
    }
  }

  const loadProposals = async (matchId) => {
    try {
      const proposals = await fetchMatchProposals(publicGroundId, matchId)
      setProposalsByMatch((prev) => ({ ...prev, [matchId]: proposals }))
    } catch {
      // Best-effort annotation only — the slot list above is the source of
      // truth for who's assigned; a failed proposals fetch just means no
      // "offer sent" badges render, never a blocking error.
    }
  }

  const proposeUmpire = async (matchId, slotId, umpireUserId, { incentiveAmount, message } = {}) => {
    setActionBusyId(slotId)
    setActionError('')
    try {
      await proposeUmpireForSlot(publicGroundId, matchId, slotId, { umpireUserId, incentiveAmount, message })
      await loadProposals(matchId)
      return true
    } catch (err) {
      setActionError(err.response?.data?.message || err.response?.data?.error || 'Unable to send this proposal.')
      return false
    } finally {
      setActionBusyId(null)
    }
  }

  const cancelProposal = async (matchId, proposalId) => {
    setActionBusyId(`proposal-${proposalId}`)
    setActionError('')
    try {
      await cancelMatchProposal(publicGroundId, matchId, proposalId)
      await loadProposals(matchId)
      return true
    } catch (err) {
      setActionError(err.response?.data?.message || err.response?.data?.error || 'Unable to withdraw this proposal.')
      return false
    } finally {
      setActionBusyId(null)
    }
  }

  return {
    slotsByMatch,
    umpireFeeByMatch,
    loadingId,
    error,
    load,
    markNoShow,
    assignReplacement,
    setFee,
    updatePaymentStatus,
    actionBusyId,
    actionError,
    proposalsByMatch,
    loadProposals,
    proposeUmpire,
    cancelProposal,
  }
}
