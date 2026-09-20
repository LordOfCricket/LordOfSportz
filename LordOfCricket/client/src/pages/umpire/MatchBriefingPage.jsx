import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Circle, MapPin, Users, AlertTriangle, Clock } from 'lucide-react'
import UmpireLayout from '../../components/umpire-dashboard/UmpireLayout.jsx'
import { StatsLoadingGrid, StatsErrorState } from '../../components/stats/StatsStates.jsx'
import { useMatchBriefing } from '../../hooks/useMatchBriefing.js'
import { useGeolocation } from '../../hooks/useGeolocation.js'
import { formatMatchDate, formatMatchTime, formatOversFormat } from '../../models/matchDiscovery.model.js'
import { checklistLabel, checklistProgress, incidentTypeLabel, INCIDENT_TYPES } from '../../models/matchBriefing.model.js'

function Section({ title, children }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-5 shadow-sm backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function ChecklistItem({ item, disabled, onToggle }) {
  const Icon = item.isChecked ? CheckCircle2 : Circle
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(item.itemKey, !item.isChecked)}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
    >
      <Icon className={`h-5 w-5 shrink-0 ${item.isChecked ? 'text-emerald-400' : 'text-slate-500'}`} />
      <span className={item.isChecked ? 'text-slate-300 line-through decoration-slate-500' : 'text-slate-200'}>{checklistLabel(item.itemKey)}</span>
    </button>
  )
}

function CheckInCard({ mySlot, checkingIn, onCheckIn }) {
  const geo = useGeolocation()

  if (mySlot?.checked_in_at) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200">
        <CheckCircle2 className="h-4 w-4" />
        Checked in at {new Date(mySlot.checked_in_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
      </div>
    )
  }

  const handleCheckIn = () => {
    if (geo.status === 'idle') {
      geo.requestLocation((coords) => onCheckIn(coords))
      return
    }
    onCheckIn(geo.coords || undefined)
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleCheckIn}
        disabled={checkingIn || geo.status === 'prompting'}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-linear-to-r from-emerald-400 to-emerald-600 px-6 text-sm font-bold text-emerald-950 shadow-md shadow-emerald-500/30 transition-all hover:-translate-y-0.5 disabled:opacity-60"
      >
        <MapPin className="h-4 w-4" />
        {geo.status === 'prompting' || checkingIn ? "Checking in…" : "I'm At The Ground"}
      </button>
      {(geo.status === 'denied' || geo.status === 'unavailable') && (
        <p className="text-xs text-amber-300/80">{geo.error || 'Location unavailable — checking in without it.'}</p>
      )}
    </div>
  )
}

function IncidentForm({ submitting, onSubmit }) {
  const [incidentType, setIncidentType] = useState(INCIDENT_TYPES[0])
  const [description, setDescription] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    await onSubmit({ incidentType, description })
    setDescription('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold text-slate-300">Type</span>
        <select
          value={incidentType}
          onChange={(e) => setIncidentType(e.target.value)}
          className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400/60"
        >
          {INCIDENT_TYPES.map((t) => (
            <option key={t} value={t} className="bg-slate-900">
              {incidentTypeLabel(t)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold text-slate-300">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="What happened?"
          className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-emerald-400/60"
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-10 w-fit items-center justify-center rounded-full bg-emerald-500 px-5 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Submit'}
      </button>
    </form>
  )
}

export default function MatchBriefingPage() {
  const { matchId } = useParams()
  const {
    summary,
    slots,
    mySlot,
    checklist,
    incidents,
    loading,
    error,
    togglingKey,
    checkingIn,
    reportingIncident,
    toggleChecklistItem,
    checkIn,
    submitIncident,
    retry,
  } = useMatchBriefing(matchId)

  if (loading) {
    return (
      <UmpireLayout title="Match Briefing">
        <StatsLoadingGrid tiles={3} />
      </UmpireLayout>
    )
  }

  if (error || !summary) {
    return (
      <UmpireLayout title="Match Briefing">
        <StatsErrorState message={error} onRetry={retry} />
      </UmpireLayout>
    )
  }

  const { match, teams, toss, ground } = summary
  const assignedUmpires = slots.filter((s) => (s.status === 'ASSIGNED' || s.status === 'COMPLETED') && s.umpire_name)
  const progress = checklistProgress(checklist)

  return (
    <UmpireLayout>
      <div className="flex flex-col gap-6">
        <div>
          <span className="text-sm font-semibold uppercase tracking-widest text-emerald-400">Match Briefing</span>
          {ground?.name && <h1 className="mt-1 text-2xl font-bold text-white">{ground.name}</h1>}
          <p className="mt-1 text-lg font-semibold text-slate-200">
            {teams.teamA.name} vs {teams.teamB.name}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
            <Clock className="h-4 w-4" />
            {formatMatchDate(match.matchDate)} · {formatMatchTime(match.matchDate)}
            {match.oversPerInnings != null && ` · ${formatOversFormat(match.oversPerInnings)}`}
          </p>
        </div>

        <Section title="Umpires">
          {assignedUmpires.length === 0 ? (
            <p className="text-sm text-slate-400">No umpires assigned yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {assignedUmpires.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm text-slate-200">
                  <Users className="h-4 w-4 text-emerald-300" />
                  {s.umpire_name}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {ground?.amenities?.length > 0 && (
          <Section title="Ground">
            <div className="flex flex-wrap gap-2">
              {ground.amenities.map((a) => (
                <span key={a} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                  {a}
                </span>
              ))}
            </div>
          </Section>
        )}

        <Section title="Match Rules">
          <p className="text-sm text-slate-300">{formatOversFormat(match.oversPerInnings) || 'Unlimited overs'} · {match.ballsPerOver} balls/over</p>
        </Section>

        <Section title="Toss">
          <p className="text-sm text-slate-300">{toss ? toss.text : 'Pending'}</p>
        </Section>

        {mySlot && (
          <Section title="Check-In">
            <CheckInCard mySlot={mySlot} checkingIn={checkingIn} onCheckIn={checkIn} />
          </Section>
        )}

        {mySlot && (
          <Section title={`Pre-Match Checklist${progress.total ? ` (${progress.done}/${progress.total})` : ''}`}>
            <div className="flex flex-col">
              {checklist.map((item) => (
                <ChecklistItem key={item.itemKey} item={item} disabled={togglingKey === item.itemKey} onToggle={toggleChecklistItem} />
              ))}
            </div>
          </Section>
        )}

        {mySlot && (
          <Section title="Report Incident">
            <div className="flex flex-col gap-4">
              <IncidentForm submitting={reportingIncident} onSubmit={submitIncident} />
              {incidents.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
                  {incidents.map((i) => (
                    <div key={i.id} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                      <div>
                        <p className="font-semibold text-slate-200">
                          {incidentTypeLabel(i.incident_type)}{' '}
                          <span className="font-normal text-slate-500">
                            · {new Date(i.occurred_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </p>
                        {i.description && <p className="text-slate-400">{i.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        )}
      </div>
    </UmpireLayout>
  )
}
