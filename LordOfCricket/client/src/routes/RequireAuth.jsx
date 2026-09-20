import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'

export default function RequireAuth({ children }) {
  const { status } = useAuth()

  if (status === 'loading') return null
  if (status === 'unauthenticated') return <Navigate to="/login" replace />

  return children
}
