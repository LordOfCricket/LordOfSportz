import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { getPostAuthPath } from '../models/roleRedirect.model.js'

// Finer-grained than RequireAuth: also checks the logged-in staff account's
// sub-role (super_admin | admin | canteen_staff). There is no 403 page in
// this app, so an unauthorized staff sub-role — or a non-staff user — is
// bounced to their own correct landing page rather than left on a dead end.
export default function RequireStaffRole({ allow, children }) {
  const { user, status } = useAuth()

  if (status === 'loading') return null
  if (status === 'unauthenticated') return <Navigate to="/login" replace />
  if (user?.role !== 'staff' || !allow.includes(user?.staff_role)) {
    return <Navigate to={getPostAuthPath(user)} replace />
  }

  return children
}
