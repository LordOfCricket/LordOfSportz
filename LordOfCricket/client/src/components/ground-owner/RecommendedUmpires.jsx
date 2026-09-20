import { useEffect, useState } from 'react'
import { Star, Sparkles } from 'lucide-react'
import { fetchRecommendedUmpires } from '../../services/groundOwnerApi.js'
import ReputationBadges from '../common/ReputationBadges.jsx'
import ProposeUmpireForm from './ProposeUmpireForm.jsx'

// Umpire Intelligence & Scale 2.0, Workstreams C/D/F/V — deterministic,
// explainable recommendations for a match with open umpire capacity.
// Purely informational by default: assignment still happens through the
// existing apply/replace flows elsewhere on this page. Umpire Proposals
// adds one exception — a "Propose" action per candidate that sends a
// (optionally bonus-sweetened) invitation to the match's first open slot,
// only rendered when the caller supplies an openSlotId and propose handler.
// Fetched on-demand only when the Ground Owner actually opens it, same
// lazy-load posture as ReplacementPicker.
export default function RecommendedUmpires({ publicGroundId, matchId, openSlotId, onPropose, proposeBusy, proposeError }) {
  const [candidates, setCandidates] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [proposingTo, setProposingTo] = useState(null)
  const canPropose = Boolean(openSlotId && onPropose)

  useEffect(() => {
    let cancelled = false
    fetchRecommendedUmpires(publicGroundId, matchId, { limit: 5 })
      .then((data) => {
        if (!cancelled) setCandidates(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || err.response?.data?.message || 'Unable to load recommended umpires.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [publicGroundId, matchId])

  return (
    <div className="mb-2 rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
        Recommended Umpires
      </p>
      {loading && <p className="mt-2 text-xs text-slate-400">Finding the best available umpires…</p>}
      {!loading && error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
      {!loading && !error && candidates?.length === 0 && <p className="mt-2 text-xs text-slate-400">No eligible umpires to recommend right now.</p>}
      {!loading && !error && candidates?.length > 0 && (
        <ul className="mt-2 space-y-2">
          {candidates.map((c) => (
            <li key={c.id} className="rounded-lg border border-white/5 bg-white/5 p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-slate-200">{c.name}</p>
                {c.reputation?.ratingCount > 0 && (
                  <span className="flex items-center gap-1 text-amber-300">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    {Number(c.reputation.ratingAvg).toFixed(1)}
                  </span>
                )}
              </div>
              <div className="mt-1">
                <ReputationBadges verified={c.reputation?.verified} badges={c.reputation?.badges} size="sm" />
              </div>
              {c.reasons?.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-[11px] text-slate-400">
                  {c.reasons.map((reason) => (
                    <li key={reason} className="flex items-center gap-1">
                      <span className="text-emerald-400">✓</span> {reason}
                    </li>
                  ))}
                </ul>
              )}
              {canPropose && proposingTo !== c.id && (
                <button
                  type="button"
                  onClick={() => setProposingTo(c.id)}
                  className="mt-2 rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-emerald-950 transition-colors hover:bg-emerald-400"
                >
                  Propose
                </button>
              )}
              {canPropose && proposingTo === c.id && (
                <ProposeUmpireForm
                  busy={proposeBusy}
                  error={proposeError}
                  onCancel={() => setProposingTo(null)}
                  onSubmit={async (payload) => {
                    const ok = await onPropose(openSlotId, c.id, payload)
                    if (ok) setProposingTo(null)
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
