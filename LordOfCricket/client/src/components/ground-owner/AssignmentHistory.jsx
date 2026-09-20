import { useEffect, useState } from 'react'
import { fetchMatchAssignmentHistory } from '../../services/groundOwnerApi.js'

// The smallest useful operational representation:
// a flat, oldest-first list of who/what/when, not a giant audit UI.
const EVENT_LABEL = {
  ASSIGNED: 'Assigned',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No Show',
  REPLACEMENT_ASSIGNED: 'Replacement',
  COMPLETED: 'Completed',
}

export default function AssignmentHistory({ publicGroundId, matchId }) {
  const [events, setEvents] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchMatchAssignmentHistory(publicGroundId, matchId)
      .then((data) => {
        if (!cancelled) setEvents(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || err.response?.data?.message || 'Unable to load assignment history.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [publicGroundId, matchId])

  if (loading) return <p className="mt-2 text-xs text-slate-400">Loading history…</p>
  if (error) return <p className="mt-2 text-xs text-rose-300">{error}</p>
  if (!events?.length) return <p className="mt-2 text-xs text-slate-400">No assignment history yet.</p>

  return (
    <ul className="mt-2 space-y-1">
      {events.map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-300">
            {e.umpire_name || 'Umpire'} — <span className="font-semibold text-slate-200">{EVENT_LABEL[e.event_type] || e.event_type}</span>
          </span>
          <span className="shrink-0 text-slate-500">{new Date(e.recorded_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
        </li>
      ))}
    </ul>
  )
}
