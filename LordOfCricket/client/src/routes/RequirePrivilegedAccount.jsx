import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { getPostAuthPath } from '../models/roleRedirect.model.js'
import { fetchMyGrounds } from '../services/groundOwnerApi.js'

// Phase 6 — UX-only restriction of the Security Settings page to Super
// Admin/Ground Owner (the only roles MFA is ever mandatory for — see
// docs/MFA.md). The API itself is deliberately NOT role-restricted
// (mfa.routes.js's own comment) since enrolling MFA is harmless for any
// account; this guard only decides who sees a reason to.
export default function RequirePrivilegedAccount({ children }) {
  const { status, mfa, user } = useAuth()
  const [groundCheck, setGroundCheck] = useState({ checked: false, ownsAnyGround: false })

  const isSuperAdmin = mfa.required || (user?.role === 'staff' && user?.staff_role === 'super_admin')
  const needsGroundCheck = status === 'authenticated' && !isSuperAdmin

  useEffect(() => {
    if (!needsGroundCheck) return
    let cancelled = false
    fetchMyGrounds()
      .then((grounds) => {
        if (!cancelled) setGroundCheck({ checked: true, ownsAnyGround: grounds.length > 0 })
      })
      .catch(() => {
        if (!cancelled) setGroundCheck({ checked: true, ownsAnyGround: false })
      })
    return () => {
      cancelled = true
    }
  }, [needsGroundCheck])

  if (status === 'loading') return null
  if (status === 'unauthenticated') return <Navigate to="/login" replace />
  if (isSuperAdmin) return children
  if (!groundCheck.checked) return null
  if (!groundCheck.ownsAnyGround) return <Navigate to={getPostAuthPath(user)} replace />

  return children
}
