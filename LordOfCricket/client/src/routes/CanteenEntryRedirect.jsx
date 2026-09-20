import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { getPostAuthPath } from '../models/roleRedirect.model.js'

export default function CanteenEntryRedirect() {
  const { user, status } = useAuth()

  if (status === 'loading') return null

  return <Navigate to={getPostAuthPath(user)} replace />
}
