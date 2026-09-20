import { useCallback, useEffect, useState } from 'react'
import { fetchGroundOwners, fetchGroundOwnerGrounds, resetUserPassword } from '../services/adminApi.js'
import { useStepUp } from './useStepUp.js'

// SUPER_ADMIN Identity & Secure Provisioning feature — "Ground Owner
// Management" (§12) + admin-initiated password recovery (§13). Recovery is
// step-up-gated ('ADMIN_PASSWORD_RESET', docs/MFA.md) same pattern as
// useGroundStaff.js's grant/disable — requestStepUp resolves immediately if
// a fresh grant already exists, otherwise shows the modal first.
export function useAdminGroundOwners() {
  const stepUp = useStepUp()
  const [owners, setOwners] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [grounds, setGrounds] = useState([])
  const [groundsLoading, setGroundsLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [resetting, setResetting] = useState(null)
  // One-time reveal of a freshly generated temp credential — never
  // persisted anywhere beyond this in-memory state, cleared on dismiss.
  const [revealedCredential, setRevealedCredential] = useState(null)

  const load = useCallback(async () => {
    try {
      setOwners(await fetchGroundOwners())
    } catch {
      setError('Unable to load ground owners.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const toggleGrounds = async (owner) => {
    if (expandedId === owner.userId) {
      setExpandedId(null)
      return
    }
    setExpandedId(owner.userId)
    setGroundsLoading(true)
    try {
      setGrounds(await fetchGroundOwnerGrounds(owner.userId))
    } catch {
      setGrounds([])
    } finally {
      setGroundsLoading(false)
    }
  }

  const triggerPasswordRecovery = async (owner) => {
    if (!window.confirm(`A new temporary password will be generated for ${owner.name} and sent to their registered email address. Their current password will be invalidated immediately. Continue?`))
      return
    setActionError('')
    setResetting(owner.userId)
    try {
      await stepUp.requestStepUp('ADMIN_PASSWORD_RESET')
      const result = await resetUserPassword(owner.userId)
      setRevealedCredential({ ownerName: owner.name, ...result })
    } catch (err) {
      if (err.message !== 'Step-up verification was cancelled.') {
        setActionError(err.response?.data?.error || err.response?.data?.message || 'Unable to generate a temporary password.')
      }
    } finally {
      setResetting(null)
    }
  }

  return {
    owners,
    loading,
    error,
    expandedId,
    grounds,
    groundsLoading,
    toggleGrounds,
    actionError,
    resetting,
    triggerPasswordRecovery,
    revealedCredential,
    dismissRevealedCredential: () => setRevealedCredential(null),
    stepUpModal: stepUp.pending,
    submitStepUp: stepUp.handleSubmit,
    cancelStepUp: stepUp.handleCancel,
  }
}
