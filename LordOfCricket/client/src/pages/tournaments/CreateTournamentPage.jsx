import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createTournament } from '../../services/tournamentApi.js'
import BackButton from '../../components/common/BackButton.jsx'

const FORMATS = [
  { value: 'LEAGUE', label: 'League / Round Robin' },
  { value: 'GROUPS_KNOCKOUT', label: 'Groups + Knockout' },
  { value: 'KNOCKOUT', label: 'Direct Knockout' },
]

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-semibold text-slate-200">{label}</span>
      {children}
    </label>
  )
}

const inputClass = 'rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400/50 focus:outline-none'

export default function CreateTournamentPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    description: '',
    format: 'LEAGUE',
    startDate: '',
    endDate: '',
    oversPerInnings: 10,
    maxTeams: 8,
    maxSquadSize: 15,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const t = await createTournament({
        name: form.name,
        description: form.description || undefined,
        format: form.format,
        startDate: form.startDate,
        endDate: form.endDate,
        oversPerInnings: Number(form.oversPerInnings),
        maxTeams: Number(form.maxTeams),
        maxSquadSize: Number(form.maxSquadSize),
      })
      navigate(`/tournaments/${t.publicTournamentId}`)
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create the tournament.')
      setSubmitting(false)
    }
  }

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat px-4 py-8 text-white sm:px-6 lg:px-8"
      style={{ backgroundImage: `linear-gradient(rgba(2,6,23,0.9), rgba(2,6,23,0.9)), url('/images/cricket-stadium.jpg')` }}
    >
      <div className="mx-auto max-w-xl">
        <BackButton label="Back to Tournaments" fallback="/tournaments" />

        <h1 className="mt-4 text-2xl font-bold text-white">Create Tournament</h1>
        <p className="mt-1 text-sm text-slate-300">Set the format and rules — teams register once you open registration.</p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/50 p-6">
          <Field label="Name">
            <input required value={form.name} onChange={set('name')} className={inputClass} placeholder="LOC Summer Championship" />
          </Field>

          <Field label="Description (optional)">
            <textarea value={form.description} onChange={set('description')} rows={2} className={inputClass} />
          </Field>

          <Field label="Format">
            <select value={form.format} onChange={set('format')} className={inputClass}>
              {FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Start Date">
              <input required type="date" value={form.startDate} onChange={set('startDate')} className={inputClass} />
            </Field>
            <Field label="End Date">
              <input required type="date" value={form.endDate} onChange={set('endDate')} className={inputClass} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Overs / Innings">
              <input required type="number" min={1} value={form.oversPerInnings} onChange={set('oversPerInnings')} className={inputClass} />
            </Field>
            <Field label="Max Teams">
              <input required type="number" min={2} value={form.maxTeams} onChange={set('maxTeams')} className={inputClass} />
            </Field>
            <Field label="Squad Size">
              <input required type="number" min={2} value={form.maxSquadSize} onChange={set('maxSquadSize')} className={inputClass} />
            </Field>
          </div>

          {form.format === 'KNOCKOUT' && <p className="text-xs text-amber-200">Direct knockout supports exactly 2, 4, or 8 registered teams.</p>}
          {form.format === 'GROUPS_KNOCKOUT' && <p className="text-xs text-amber-200">Groups + Knockout needs an even number of teams (minimum 4), split evenly into two groups.</p>}

          {error && <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 inline-flex items-center justify-center rounded-full bg-linear-to-r from-emerald-400 to-emerald-600 px-6 py-3 text-sm font-bold text-emerald-950 shadow-md shadow-emerald-500/30 transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create Tournament'}
          </button>
        </form>
      </div>
    </main>
  )
}
