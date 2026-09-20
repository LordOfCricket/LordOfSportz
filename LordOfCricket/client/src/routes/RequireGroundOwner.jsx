import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { fetchMyGrounds } from '../services/groundOwnerApi.js'

// UX/navigation guard only, same posture as RequireApprovedUmpire — the
// real authorization is server-side (requireGroundRole('GROUND_OWNER') on
// every ground-owner route, a real ground_users row lookup). Not
// RequireStaffRole: a Ground Owner is not necessarily a staff account.
//
// GET /ground-owner/grounds itself only requires requireAuth (any
// authenticated user), returning an empty list for a non-owner rather than
// a 403 — so "does this user own anything" is determined by list length,
// not by catching a rejected request.
export default function RequireGroundOwner({ children }) {
  const { status: authStatus } = useAuth()
  const [checked, setChecked] = useState(false)
  const [ownsAnyGround, setOwnsAnyGround] = useState(false)

  useEffect(() => {
    if (authStatus !== 'authenticated') return
    fetchMyGrounds()
      .then((grounds) => setOwnsAnyGround(grounds.length > 0))
      .catch(() => setOwnsAnyGround(false))
      .finally(() => setChecked(true))
  }, [authStatus])

  if (authStatus === 'loading') return null
  if (authStatus === 'unauthenticated') return <Navigate to="/login" replace />
  if (!checked) return null
  // Not an owner of anything — send to ground registration, the actual path
  // to becoming one, rather than a dead end.
  if (!ownsAnyGround) return <Navigate to="/register-ground" replace />

  return children
}
