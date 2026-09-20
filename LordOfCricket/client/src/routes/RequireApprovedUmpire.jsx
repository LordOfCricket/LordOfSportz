import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useUmpireStatus } from '../hooks/useUmpireStatus.js'

// UX/navigation guard only — mirrors RequireStaffRole's shape, but the real
// authorization check (player_type='umpire' AND latest umpire_requests
// approved) is server-side (auth.js's requireApprovedUmpire/requireScorer/
// requireMatchScorer). Hiding this route is not a security boundary; every
// API these pages call re-checks approval itself.
//
// Reuses useUmpireStatus() (the same hook UmpireStatusPage already uses) so
// there is exactly one place that fetches "my umpire request status" — not
// a second, parallel check that could drift from it.
export default function RequireApprovedUmpire({ children }) {
  const { status: authStatus } = useAuth()
  const { request, loading } = useUmpireStatus()

  if (authStatus === 'loading') return null
  if (authStatus === 'unauthenticated') return <Navigate to="/login" replace />
  if (loading) return null
  // Not approved (pending/rejected/never requested) — send back to the
  // existing status page, which already shows exactly why and lets them
  // (re)request. Never a dead end, never a broken umpire-only page.
  if (request?.status !== 'approved') return <Navigate to="/umpire" replace />

  return children
}
