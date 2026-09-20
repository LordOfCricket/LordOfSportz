import { useCallback, useEffect, useState } from 'react'
import {
  fetchGroundStaff,
  createGroundStaff,
  fetchPermissionCatalog,
  grantStaffPermission,
  revokeStaffPermission,
  disableGroundStaff,
} from '../services/groundOwnerApi.js'
import { useStepUp } from './useStepUp.js'

// Phase 4 — ground-scoped Staff. Mirrors useGroundMatches.js's load/create shape.
// Phase 5 — adds the permission catalog (fetched once, ground-agnostic) and
// grant/revoke/disable actions. Every action just calls `load()` afterward
// rather than patching local state optimistically — these are infrequent
// admin actions, not a hot path, so a fresh server read is simpler and
// can't drift from what the server actually persisted.
export function useGroundStaff(publicGroundId) {
  // Phase 6 — granting a permission and disabling a membership are both
  // step-up-gated server-side (docs/MFA.md); revoke and staff creation
  // (above) deliberately are not. requestStepUp resolves immediately if a
  // fresh grant already exists, otherwise it shows the modal and waits.
  const stepUp = useStepUp()
  const [staff, setStaff] = useState([])
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [actionError, setActionError] = useState('')

  const load = useCallback(async () => {
    if (!publicGroundId) return
    setLoading(true)
    try {
      setStaff(await fetchGroundStaff(publicGroundId))
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load staff for this ground.')
    } finally {
      setLoading(false)
    }
  }, [publicGroundId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
      fetchPermissionCatalog().then(setCatalog).catch(() => setCatalog([]))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const create = async ({ name, identifier, role }) => {
    setCreating(true)
    setCreateError('')
    try {
      await createGroundStaff(publicGroundId, { name, identifier, role })
      await load()
      return true
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Unable to add this staff member.')
      return false
    } finally {
      setCreating(false)
    }
  }

  const grant = async (membershipId, permissionKey) => {
    setActionError('')
    try {
      await stepUp.requestStepUp('PERMISSION_GRANT')
      await grantStaffPermission(publicGroundId, membershipId, permissionKey)
      await load()
    } catch (err) {
      if (err.message !== 'Step-up verification was cancelled.') {
        setActionError(err.response?.data?.error || err.response?.data?.message || 'Unable to grant this permission.')
      }
    }
  }

  const revoke = async (membershipId, permissionKey) => {
    setActionError('')
    try {
      await revokeStaffPermission(publicGroundId, membershipId, permissionKey)
      await load()
    } catch (err) {
      setActionError(err.response?.data?.message || 'Unable to revoke this permission.')
    }
  }

  const disable = async (membershipId) => {
    setActionError('')
    try {
      await stepUp.requestStepUp('STAFF_DISABLE')
      await disableGroundStaff(publicGroundId, membershipId)
      await load()
    } catch (err) {
      if (err.message !== 'Step-up verification was cancelled.') {
        setActionError(err.response?.data?.error || err.response?.data?.message || 'Unable to disable this staff member.')
      }
    }
  }

  return {
    staff,
    catalog,
    loading,
    error,
    creating,
    createError,
    actionError,
    create,
    grant,
    revoke,
    disable,
    refresh: load,
    stepUpModal: stepUp.pending,
    submitStepUp: stepUp.handleSubmit,
    cancelStepUp: stepUp.handleCancel,
  }
}
