import { useState } from 'react'
import { X } from 'lucide-react'
import { useMyGrounds } from '../../hooks/useMyGrounds.js'
import { fetchGroundMatches, fetchGroundMatchUmpireSlots } from '../../services/groundOwnerApi.js'
import { proposeUmpireForSlot } from '../../services/umpireProposalApi.js'
import { formatMatchDate, formatMatchTime } from '../../models/matchDiscovery.model.js'
import ProposeUmpireForm from './ProposeUmpireForm.jsx'

// Browse Umpires' own entry point into the same proposal flow
// RecommendedUmpires uses inline on a match's own page — here the Ground
// Owner starts from a candidate (not a match), so this modal walks
// ground → match → open slot first, entirely from data already fetched
// elsewhere in the app (no new aggregate endpoint, per the plan). Each step
// fetches directly from its own onChange handler (not an effect keyed on
// derived selection state) — there's no external state to synchronize with,
// just one user action triggering one fetch.
export default function ProposeToUmpireModal({ candidate, onClose, onSent }) {
  const { grounds, loading: groundsLoading } = useMyGrounds()
  const [publicGroundId, setPublicGroundId] = useState('')
  const [matches, setMatches] = useState(null)
  const [matchesLoading, setMatchesLoading] = useState(false)
  const [matchId, setMatchId] = useState('')
  const [slots, setSlots] = useState(null)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotId, setSlotId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const selectGround = (gid) => {
    setPublicGroundId(gid)
    setMatches(null)
    setMatchId('')
    setSlots(null)
    setSlotId('')
    if (!gid) return
    setMatchesLoading(true)
    fetchGroundMatches(gid)
      .then((data) => setMatches(data.filter((m) => m.status === 'upcoming' && m.filled_slots < m.total_slots)))
      .catch(() => setMatches([]))
      .finally(() => setMatchesLoading(false))
  }

  const selectMatch = (mid) => {
    setMatchId(mid)
    setSlots(null)
    setSlotId('')
    if (!mid) return
    setSlotsLoading(true)
    fetchGroundMatchUmpireSlots(publicGroundId, mid)
      .then(({ slots: fetched }) => setSlots(fetched.filter((s) => s.status === 'AVAILABLE' || s.status === 'CANCELLED')))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false))
  }

  const handleSubmit = async ({ incentiveAmount, message }) => {
    if (!slotId) return
    setBusy(true)
    setError('')
    try {
      await proposeUmpireForSlot(publicGroundId, matchId, slotId, { umpireUserId: candidate.id, incentiveAmount, message })
      onSent?.()
      onClose()
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to send this proposal.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-[1.5rem] border border-white/10 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Propose Umpire</p>
            <h2 className="mt-0.5 text-lg font-bold text-white">{candidate.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-300">Ground</span>
            <select
              value={publicGroundId}
              onChange={(e) => selectGround(e.target.value)}
              disabled={groundsLoading}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
            >
              <option value="" className="bg-slate-900">— Select a ground —</option>
              {grounds.map((g) => (
                <option key={g.public_ground_id} value={g.public_ground_id} className="bg-slate-900">
                  {g.name}
                </option>
              ))}
            </select>
          </label>

          {publicGroundId && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-300">Match</span>
              <select
                value={matchId}
                onChange={(e) => selectMatch(e.target.value)}
                disabled={matchesLoading}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
              >
                <option value="" className="bg-slate-900">
                  {matchesLoading ? 'Loading matches…' : '— Select a match —'}
                </option>
                {matches?.map((m) => (
                  <option key={m.id} value={m.id} className="bg-slate-900">
                    {m.team_a_name} vs {m.team_b_name} · {formatMatchDate(m.match_date)} {formatMatchTime(m.match_date)}
                  </option>
                ))}
              </select>
              {!matchesLoading && matches?.length === 0 && (
                <p className="mt-1 text-xs text-slate-400">No upcoming matches with an open umpire slot at this ground.</p>
              )}
            </label>
          )}

          {matchId && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-300">Open Slot</span>
              <select
                value={slotId}
                onChange={(e) => setSlotId(e.target.value)}
                disabled={slotsLoading}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
              >
                <option value="" className="bg-slate-900">
                  {slotsLoading ? 'Loading slots…' : '— Select a slot —'}
                </option>
                {slots?.map((s, i) => (
                  <option key={s.id} value={s.id} className="bg-slate-900">
                    Umpire Slot {i + 1}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {slotId && <ProposeUmpireForm busy={busy} error={error} onCancel={onClose} onSubmit={handleSubmit} />}
      </div>
    </div>
  )
}
