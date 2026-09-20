import { useEffect, useMemo, useState } from 'react'
import { DISMISSAL_TYPES, CORRECTION_REASONS } from '../../models/dismissalTypes.js'

const RESULT_TYPES = [
  { id: 'normal', label: 'Normal' },
  { id: 'wide', label: 'Wide' },
  { id: 'no-ball', label: 'No Ball' },
  { id: 'bye', label: 'Bye' },
  { id: 'leg-bye', label: 'Leg Bye' },
  { id: 'wicket', label: 'Wicket' },
  { id: 'dead-ball', label: 'Dead Ball' },
  // Phase 4 (Umpire Module) — voiding used to be a separate one-tap button
  // that committed immediately, bypassing the live before/after preview
  // every other correction gets. Folding it into the same Result picker
  // means it now goes through the identical patch -> preview -> Apply
  // pipeline as everything else, with no special-cased confirmation logic.
  { id: 'void', label: 'Void', destructive: true },
]

function resultTypeOf(d) {
  if (d.isDeadBall) return 'dead-ball'
  if (d.wicket) return 'wicket'
  if (d.illegal?.type === 'wide') return 'wide'
  if (d.illegal?.type === 'no-ball') return 'no-ball'
  if (d.extra?.type === 'bye') return 'bye'
  if (d.extra?.type === 'leg-bye') return 'leg-bye'
  return 'normal'
}

function buildPatch({ resultType, runs, extraRuns, wicket }) {
  const base = { batRuns: 0, illegal: null, extra: null, wicket: null, isDeadBall: false }
  switch (resultType) {
    case 'wide':
      return { ...base, illegal: { type: 'wide', runs: 1 + extraRuns } }
    case 'no-ball':
      return { ...base, batRuns: runs, illegal: { type: 'no-ball', runs: 1 } }
    case 'bye':
      return { ...base, extra: { type: 'bye', runs: extraRuns } }
    case 'leg-bye':
      return { ...base, extra: { type: 'leg-bye', runs: extraRuns } }
    case 'dead-ball':
      return { ...base, isDeadBall: true }
    case 'void':
      return { ...base, voided: true }
    case 'wicket':
      return { ...base, batRuns: wicket?.type === 'run-out' ? wicket.runsCompleted || 0 : 0, wicket }
    default:
      return { ...base, batRuns: runs }
  }
}

export default function DeliveryCorrectionEditor({ delivery, playersById, bowlingSquad, previewCorrection, onApply, onCancel }) {
  const [resultType, setResultType] = useState(resultTypeOf(delivery))
  const [runs, setRuns] = useState(delivery.batRuns || 0)
  const [extraRuns, setExtraRuns] = useState(delivery.illegal?.runs ? delivery.illegal.runs - 1 : delivery.extra?.runs || 1)
  const [wicketType, setWicketType] = useState(delivery.wicket?.type || null)
  const [dismissedId, setDismissedId] = useState(delivery.wicket?.dismissedMatchPlayerId || delivery.strikerMatchPlayerId)
  const [runsCompleted, setRunsCompleted] = useState(delivery.wicket?.runsCompleted || 0)
  const [newBowlerId, setNewBowlerId] = useState(null)
  const [reason, setReason] = useState('WRONG_RUNS')
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState(null)
  const [previewError, setPreviewError] = useState('')
  const [applying, setApplying] = useState(false)

  const wicket = resultType === 'wicket' && wicketType ? { type: wicketType, dismissedMatchPlayerId: wicketType === 'run-out' ? dismissedId : undefined, runsCompleted: wicketType === 'run-out' ? runsCompleted : undefined } : null

  const patch = useMemo(() => {
    const base = buildPatch({ resultType, runs, extraRuns, wicket })
    return newBowlerId ? { ...base, bowlerMatchPlayerId: newBowlerId } : base
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultType, runs, extraRuns, wicketType, dismissedId, runsCompleted, newBowlerId])

  const selectResultType = (id) => {
    setResultType(id)
    // A void is virtually always "recorded in error" — set that default the
    // moment it's picked so the umpire doesn't have to also remember to set
    // the Reason chip; they can still change it before applying.
    if (id === 'void') setReason('ACCIDENTAL_DELIVERY')
  }

  useEffect(() => {
    let cancelled = false
    previewCorrection('delivery', delivery.id, patch)
      .then((p) => {
        if (!cancelled) {
          setPreview(p)
          setPreviewError('')
        }
      })
      .catch((err) => {
        if (!cancelled) setPreviewError(err.response?.data?.message || 'Unable to preview this correction.')
      })
    return () => {
      cancelled = true
    }
  }, [patch, delivery.id, previewCorrection])

  const canApply = preview?.valid && (resultType !== 'wicket' || (wicketType && (wicketType !== 'run-out' || dismissedId)))

  const handleApply = async () => {
    setApplying(true)
    try {
      await onApply(patch, reason, resultType === 'void' ? note || 'Recorded in error' : note)
    } finally {
      setApplying(false)
    }
  }

  const striker = playersById.get(delivery.strikerMatchPlayerId)
  const nonStriker = playersById.get(delivery.nonStrikerMatchPlayerId)
  const bowler = playersById.get(newBowlerId || delivery.bowlerMatchPlayerId)

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">
            Over {delivery.over - 1}.{delivery.ball - 1}
          </p>
          <p className="mt-1 text-sm text-white">
            Striker: <span className="font-semibold">{striker?.name || '—'}</span> · Non-Striker: <span className="font-semibold">{nonStriker?.name || '—'}</span>
          </p>
          <p className="text-sm text-emerald-100/70">Bowler: {bowler?.name || '—'}</p>
          {delivery.isFreeHit && <p className="mt-1 text-xs font-semibold text-amber-300">🔥 This delivery was a Free Hit</p>}
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Result</p>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {RESULT_TYPES.filter((t) => t.id !== 'void' || !delivery.voided).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectResultType(t.id)}
                className={`min-h-10 rounded-lg border text-xs font-semibold transition-all ${
                  resultType === t.id
                    ? t.destructive
                      ? 'border-rose-400/60 bg-rose-500/20 text-white'
                      : 'border-emerald-400/60 bg-emerald-500/20 text-white'
                    : t.destructive
                      ? 'border-rose-400/30 bg-rose-500/5 text-rose-200 hover:bg-rose-500/10'
                      : 'border-white/10 bg-white/5 text-emerald-100/80 hover:bg-white/10'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {(resultType === 'normal' || resultType === 'no-ball') && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">{resultType === 'no-ball' ? 'Bat Runs' : 'Runs'}</p>
            <div className="mt-2 grid grid-cols-7 gap-1.5">
              {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                <button key={n} type="button" onClick={() => setRuns(n)} className={`min-h-10 rounded-lg text-sm font-bold ${runs === n ? 'bg-emerald-500 text-emerald-950' : 'bg-white/10 text-emerald-100/70'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {(resultType === 'wide' || resultType === 'bye' || resultType === 'leg-bye') && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">{resultType === 'wide' ? 'Additional Runs' : 'Runs'}</p>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {(resultType === 'wide' ? [0, 1, 2, 3, 4] : [1, 2, 3, 4]).map((n) => (
                <button key={n} type="button" onClick={() => setExtraRuns(n)} className={`min-h-10 rounded-lg text-sm font-bold ${extraRuns === n ? 'bg-amber-400 text-amber-950' : 'bg-white/10 text-emerald-100/70'}`}>
                  {resultType === 'wide' ? `+${n}` : n}
                </button>
              ))}
            </div>
          </div>
        )}

        {resultType === 'wicket' && (
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Dismissal Type</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {DISMISSAL_TYPES.map((d) => (
                  <button key={d.id} type="button" onClick={() => setWicketType(d.id)} className={`min-h-10 rounded-lg border px-2 text-xs font-semibold ${wicketType === d.id ? 'border-rose-400/60 bg-rose-500/20 text-white' : 'border-white/10 bg-white/5 text-emerald-100/80'}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            {wicketType === 'run-out' && (
              <>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Who Was Dismissed?</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {[delivery.strikerMatchPlayerId, delivery.nonStrikerMatchPlayerId].filter(Boolean).map((id) => (
                      <button key={id} type="button" onClick={() => setDismissedId(id)} className={`min-h-10 rounded-lg border px-2 text-xs font-medium ${dismissedId === id ? 'border-rose-400/50 bg-rose-500/20 text-white' : 'border-white/10 bg-white/5 text-emerald-100/80'}`}>
                        {playersById.get(id)?.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Runs Completed</p>
                  <div className="mt-2 flex gap-2">
                    {[0, 1, 2, 3].map((n) => (
                      <button key={n} type="button" onClick={() => setRunsCompleted(n)} className={`h-10 w-10 rounded-lg text-sm font-bold ${runsCompleted === n ? 'bg-emerald-500 text-emerald-950' : 'bg-white/10 text-emerald-100/70'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Correct Bowler</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {bowlingSquad
              .filter((mp) => mp.id !== delivery.bowlerMatchPlayerId)
              .map((mp) => (
                <button key={mp.id} type="button" onClick={() => setNewBowlerId(newBowlerId === mp.id ? null : mp.id)} className={`min-h-10 rounded-lg border px-2 text-left text-xs font-medium ${newBowlerId === mp.id ? 'border-emerald-400/50 bg-emerald-500/20 text-white' : 'border-white/10 bg-white/5 text-emerald-100/80'}`}>
                  {mp.name}
                </button>
              ))}
          </div>
        </div>

        {previewError && <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-rose-300">{previewError}</div>}

        {preview && !previewError && (
          <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Correction Preview</p>
            <div className="mt-2 space-y-1 text-sm text-emerald-50/90">
              <p>
                Score: {preview.before.runs}/{preview.before.wickets} → {preview.after.runs}/{preview.after.wickets}
              </p>
              <p>
                Current Striker: {playersById.get(preview.before.ends.strikerEnd)?.name || '—'} → {playersById.get(preview.after.ends.strikerEnd)?.name || '—'}
              </p>
              <p>Affected Deliveries: {preview.affectedDeliveryCount}</p>
              {preview.dismissedPlayerChanges.length > 0 && (
                <p className="text-amber-200">Also changes who was given out on {preview.dismissedPlayerChanges.map((c) => `${c.over - 1}.${c.ball - 1}`).join(', ')}.</p>
              )}
              {!preview.valid && (
                <p className="font-semibold text-rose-300">
                  ⚠ {preview.validationError?.message || 'This correction leaves the innings in a state that cannot be applied automatically.'}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Reason</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CORRECTION_REASONS.map((r) => (
              <button key={r.id} type="button" onClick={() => setReason(r.id)} className={`rounded-full border px-3 py-1 text-xs font-medium ${reason === r.id ? 'border-emerald-400/50 bg-emerald-500/20 text-white' : 'border-white/10 bg-white/5 text-emerald-100/70'}`}>
                {r.label}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            rows={2}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
        </div>
      </div>

      <div className="flex gap-2 border-t border-white/10 p-4">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl bg-white/10 py-3 text-sm font-semibold text-white">
          Cancel
        </button>
        <button
          type="button"
          disabled={!canApply || applying}
          onClick={handleApply}
          className={`flex-1 rounded-xl py-3 text-sm font-bold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-40 ${
            resultType === 'void' ? 'bg-rose-500 text-rose-50' : 'bg-emerald-500 text-emerald-950'
          }`}
        >
          {applying ? 'Applying…' : resultType === 'void' ? 'Void Delivery' : 'Apply Correction'}
        </button>
      </div>
    </div>
  )
}
