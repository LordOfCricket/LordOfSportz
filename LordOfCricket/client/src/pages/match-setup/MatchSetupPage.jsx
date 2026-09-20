import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchTeams } from '../../services/playerApi.js'
import { createMatch } from '../../services/matchApi.js'
import Input from '../../components/ui/Input.jsx'
import Button from '../../components/ui/Button.jsx'
import BackButton from '../../components/common/BackButton.jsx'

function Select({ label, value, onChange, children }) {
  return (
    <label className="block">
      <span className="mb-3 block text-sm font-semibold tracking-wide text-slate-200">{label}</span>
      <select
        value={value}
        onChange={onChange}
        className="w-full rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-base text-white outline-none backdrop-blur-md transition-all duration-300 focus:border-green-400 focus:bg-white/10 focus:ring-4 focus:ring-green-500/20"
      >
        {children}
      </select>
    </label>
  )
}

export default function MatchSetupPage() {
  const navigate = useNavigate()
  const [teams, setTeams] = useState([])
  const [teamAId, setTeamAId] = useState('')
  const [teamBId, setTeamBId] = useState('')
  const [venue, setVenue] = useState('')
  const [matchDate, setMatchDate] = useState('')
  const [oversPerInnings, setOversPerInnings] = useState(20)
  const [ballsPerOver, setBallsPerOver] = useState(6)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchTeams().then(setTeams).catch(() => setTeams([]))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!teamAId || !teamBId) return setError('Select both teams.')
    if (teamAId === teamBId) return setError('Team A and Team B must be different.')
    if (!matchDate) return setError('Match date is required.')

    setSubmitting(true)
    try {
      const match = await createMatch({
        teamAId: Number(teamAId),
        teamBId: Number(teamBId),
        venue: venue || undefined,
        matchDate,
        oversPerInnings: oversPerInnings ? Number(oversPerInnings) : null,
        ballsPerOver: Number(ballsPerOver),
      })
      navigate(`/matches/${match.id}/setup`)
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to create match.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat px-4 py-10 text-white sm:px-6 lg:px-8"
      style={{ backgroundImage: `linear-gradient(rgba(2,6,23,0.78), rgba(2,6,23,0.78)), url('/images/cricket-stadium.jpg')` }}
    >
      <div className="mx-auto max-w-2xl">
        {/* This route is super_admin-only (RequireStaffRole) — the real
            workspace to return to is the admin dashboard, not the player
            one the old hardcoded destination pointed at. */}
        <BackButton label="Back to Dashboard" fallback="/admin/dashboard" />

        <h1 className="mt-6 text-3xl font-bold text-white">New Match</h1>
        <p className="mt-1 text-sm text-slate-300">Set up a real, officially scored LOC match.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6 rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm sm:p-8">
          {error && <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-rose-300">{error}</div>}

          <div className="grid gap-6 sm:grid-cols-2">
            <Select label="Team A" value={teamAId} onChange={(e) => setTeamAId(e.target.value)}>
              <option value="" className="bg-slate-900">— Select —</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id} className="bg-slate-900">{t.name}</option>
              ))}
            </Select>
            <Select label="Team B" value={teamBId} onChange={(e) => setTeamBId(e.target.value)}>
              <option value="" className="bg-slate-900">— Select —</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id} className="bg-slate-900">{t.name}</option>
              ))}
            </Select>
          </div>

          <Input label="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="LOC Ground" />
          <Input label="Date & Time" type="datetime-local" value={matchDate} onChange={(e) => setMatchDate(e.target.value)} required />

          <div className="grid gap-6 sm:grid-cols-2">
            <Input label="Overs per Innings" type="number" min={1} value={oversPerInnings} onChange={(e) => setOversPerInnings(e.target.value)} />
            <Input label="Balls per Over" type="number" min={1} value={ballsPerOver} onChange={(e) => setBallsPerOver(e.target.value)} />
          </div>

          <Button type="submit" disabled={submitting} className="h-12 w-full">
            {submitting ? 'Creating…' : 'Create Match'}
          </Button>
        </form>
      </div>
    </main>
  )
}
