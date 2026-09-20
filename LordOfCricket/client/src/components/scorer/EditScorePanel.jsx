import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import DeliveryCorrectionEditor from './DeliveryCorrectionEditor.jsx'
import { CORRECTION_REASONS } from '../../models/dismissalTypes.js'

function resultText(d) {
  if (d.voided) return 'Voided'
  if (d.isDeadBall) return 'Dead Ball'
  if (d.wicket) return 'WICKET'
  if (d.illegal?.type === 'wide') return `Wide${d.illegal.runs > 1 ? ` +${d.illegal.runs - 1}` : ''}`
  if (d.illegal?.type === 'no-ball') return `No Ball${d.batRuns ? ` +${d.batRuns}` : ''}`
  if (d.extra?.type === 'bye') return `${d.extra.runs} Bye${d.extra.runs === 1 ? '' : 's'}`
  if (d.extra?.type === 'leg-bye') return `${d.extra.runs} Leg Bye${d.extra.runs === 1 ? '' : 's'}`
  if (d.totalRuns === 0) return 'Dot'
  return `${d.totalRuns} Run${d.totalRuns === 1 ? '' : 's'}`
}

function reasonLabel(code) {
  return CORRECTION_REASONS.find((r) => r.id === code)?.label || code
}

export default function EditScorePanel({ timeline, corrections, playersById, bowlingSquad, previewCorrection, onApplyCorrection, onUndoCorrection, onClose }) {
  const [selectedId, setSelectedId] = useState(null)
  const [tab, setTab] = useState('deliveries') // 'deliveries' | 'history'

  const correctedDeliveryIds = useMemo(() => new Set(corrections.filter((c) => c.target_type === 'delivery').map((c) => String(c.target_id))), [corrections])

  const selectedDelivery = selectedId ? timeline.timeline.find((e) => e.kind === 'delivery' && String(e.id) === String(selectedId)) : null

  const handleApply = async (patch, reasonCode, note) => {
    await onApplyCorrection(selectedId, patch, reasonCode, note)
    setSelectedId(null)
  }

  const latestCorrection = corrections[0]
  const canUndo = Boolean(latestCorrection) && !corrections.some((c) => c.undoes_correction_id === latestCorrection.id)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-emerald-950">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          {selectedDelivery && (
            <button type="button" onClick={() => setSelectedId(null)} className="text-sm text-emerald-100/70 hover:text-white">
              ← Back
            </button>
          )}
          <h2 className="text-base font-bold text-white">{selectedDelivery ? 'Edit Delivery' : 'Edit Score'}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5 text-emerald-100/60" />
        </button>
      </header>

      <div className="min-h-0 flex-1">
        {selectedDelivery ? (
          <DeliveryCorrectionEditor
            delivery={selectedDelivery}
            playersById={playersById}
            bowlingSquad={bowlingSquad}
            previewCorrection={previewCorrection}
            onApply={handleApply}
            onCancel={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex h-full flex-col">
            <div className="flex gap-1 border-b border-white/10 px-4 py-2">
              <button type="button" onClick={() => setTab('deliveries')} className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase ${tab === 'deliveries' ? 'bg-emerald-500 text-emerald-950' : 'text-slate-300'}`}>
                Deliveries
              </button>
              <button type="button" onClick={() => setTab('history')} className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase ${tab === 'history' ? 'bg-emerald-500 text-emerald-950' : 'text-slate-300'}`}>
                Correction History
              </button>
            </div>

            {tab === 'deliveries' ? (
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {timeline.byOver.length === 0 && <p className="text-sm text-emerald-100/40">No deliveries recorded yet.</p>}
                {timeline.byOver.map((group) => (
                  <div key={group.over} className="mb-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-300">Over {group.over}</p>
                    <div className="space-y-1.5">
                      {group.deliveries.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setSelectedId(d.id)}
                          className="flex min-h-12 w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left transition-all hover:bg-white/10 active:scale-[0.99]"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-10 shrink-0 text-xs font-semibold text-emerald-100/50">
                              {d.over - 1}.{d.ball - 1}
                            </span>
                            <span className="text-sm text-white">
                              {playersById.get(d.strikerMatchPlayerId)?.name || '—'} <span className="text-emerald-100/40">→</span> {playersById.get(d.bowlerMatchPlayerId)?.name || '—'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {correctedDeliveryIds.has(String(d.id)) && (
                              <span className="text-xs text-amber-300" title="Corrected">✏</span>
                            )}
                            <span className={`text-sm font-bold ${d.wicket ? 'text-rose-300' : d.voided ? 'text-slate-500 line-through' : 'text-emerald-100'}`}>{resultText(d)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-4 py-3">
                <div className="mb-3 flex justify-end">
                  <button
                    type="button"
                    disabled={!canUndo}
                    onClick={() => onUndoCorrection(latestCorrection.id)}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-emerald-100/70 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Undo Last Correction
                  </button>
                </div>
                {corrections.length === 0 ? (
                  <p className="text-sm text-emerald-100/40">No corrections yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {corrections.map((c) => (
                      <li key={c.id} className="rounded-xl bg-white/5 px-3 py-2.5 text-sm text-emerald-100/80">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white">{c.target_type === 'delivery' ? `Delivery #${c.target_id}` : `Event #${c.target_id}`}</span>
                          <span className="text-xs text-emerald-100/50">{new Date(c.created_at).toLocaleString()}</span>
                        </div>
                        <p className="mt-1 text-xs text-emerald-100/60">
                          {reasonLabel(c.reason_code)}
                          {c.note && ` — ${c.note}`}
                          {c.undoes_correction_id && ' (undo)'}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">v{c.source_version} → v{c.result_version} · by user #{c.corrected_by_user_id}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
