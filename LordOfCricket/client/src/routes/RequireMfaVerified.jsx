import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'

// Phase 6 — UX/navigation guard only, same posture as every other Require*
// guard in this folder: the real enforcement is server-side
// (requireStaffRole/requireGroundRole/requireGroundPermission all check
// req.mfaVerified independently — see docs/MFA.md). This only sends an
// unverified Super Admin/Ground Owner to the verification page instead of
// letting them hit a 403 from a route they can't visually tell is gated.
//
// `mfa.required` (from /auth/me) reflects Super Admin only — resolving
// "is this user a Ground Owner" needs a ground_users query the low-frequency
// /auth/me endpoint deliberately doesn't pay on every mount (see
// auth.controller.js#me's own comment). For `/ground-owner/*` routes, this
// component is nested INSIDE <RequireGroundOwner>, which already made its
// own live fetchMyGrounds() call and confirmed real ownership before
// rendering children at all — pass `force` there so this guard treats MFA
// as required without re-deriving ownership a second time.
export default function RequireMfaVerified({ children, force = false }) {
  const { status, mfa } = useAuth()
  const location = useLocation()

  if (status === 'loading') return null
  if (status === 'unauthenticated') return <Navigate to="/login" replace />

  const mfaRequired = force || mfa.required
  if (mfaRequired && !mfa.verified) {
    return <Navigate to="/security/mfa-verify" replace state={{ from: location.pathname }} />
  }

  return children
}
