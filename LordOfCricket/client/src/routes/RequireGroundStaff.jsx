import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'

// UX/navigation guard only, same posture as RequireGroundOwner — the real
// authorization is server-side (groundAccess.js re-derives the membership
// from req.user.id + :publicGroundId on every request). Deliberately does
// NOT redirect on "zero memberships" the way RequireGroundOwner redirects to
// /register-ground: staff has no analogous self-service next action, so
// StaffDashboardPage itself renders the empty state instead.
export default function RequireGroundStaff({ children }) {
  const { status: authStatus } = useAuth()

  if (authStatus === 'loading') return null
  if (authStatus === 'unauthenticated') return <Navigate to="/login" replace />

  return children
}
