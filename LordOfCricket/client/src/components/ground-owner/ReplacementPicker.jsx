import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { fetchEligibleReplacements } from '../../services/groundOwnerApi.js'
import ReputationBadges from '../common/ReputationBadges.jsx'

// Candidate pool for a NO_SHOW slot, fetched
// on-demand only when the owner actually opens "Find Replacement" (never
// pre-loaded for every slot). Server already filters to approved + no
// conflicting match + available + not already on this match
// (groundOwner.service.js#listEligibleReplacements) — this just renders it.
export default function ReplacementPicker({ publicGroundId, matchId, slotId, busy, onAssign, onCancel }) {
  const [candidates, setCandidates] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchEligibleReplacements(publicGroundId, matchId, slotId)
      .then((data) => {
        if (!cancelled) setCandidates(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || err.response?.data?.message || 'Unable to load eligible umpires.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [publicGroundId, matchId, slotId])

  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Find Replacement</p>
      {loading && <p className="mt-2 text-xs text-slate-400">Loading eligible umpires…</p>}
      {!loading && error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
      {!loading && !error && candidates?.length === 0 && <p className="mt-2 text-xs text-slate-400">No eligible umpires found right now.</p>}
      {!loading && !error && candidates?.length > 0 && (
        <ul className="mt-2 space-y-2">
          {candidates.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/5 p-2 text-xs">
              <div className="min-w-0">
                <p className="font-semibold text-slate-200">{c.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                  {c.reputation?.ratingCount > 0 ? (
                    <span className="flex items-center gap-1 text-amber-300">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {Number(c.reputation.ratingAvg).toFixed(1)} ({c.reputation.ratingCount})
                    </span>
                  ) : (
                    <span>No reviews yet</span>
                  )}
                  {c.reputation?.reliability != null && <span>Reliability {c.reputation.reliability}%</span>}
                  <span>{c.reputation?.matchesOfficiated ?? 0} Matches</span>
                </div>
                <div className="mt-1">
                  <ReputationBadges verified={c.reputation?.verified} badges={c.reputation?.badges} size="sm" />
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => onAssign(c.id)}
                className="shrink-0 rounded-full bg-emerald-500 px-3 py-1 font-semibold text-emerald-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? 'Assigning…' : 'Select'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onCancel} className="mt-2 text-xs font-semibold text-slate-400 hover:text-slate-200">
        Cancel
      </button>
    </div>
  )
}
