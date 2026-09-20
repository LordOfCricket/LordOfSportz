import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import BackButton from '../../components/common/BackButton.jsx'
import { useMyGrounds } from '../../hooks/useMyGrounds.js'
import { useAuth } from '../../hooks/useAuth.js'
import { useMatchProposals } from '../../hooks/useMatchProposals.js'
import { todayDateInputValue, addDaysToDateStr } from '../../models/booking.model.js'
import Button from '../../components/ui/Button.jsx'

export default function CreateMatchProposalPage() {
  const navigate = useNavigate()
  const { player } = useAuth()
  const { grounds, loading: groundsLoading } = useMyGrounds()
  const [selectedGround, setSelectedGround] = useState(null)
  const [bookingDate, setBookingDate] = useState(() => todayDateInputValue())
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [teams, setTeams] = useState([])
  const [teamsLoading, setTeamsLoading] = useState(true)
  const [opposingTeamId, setOpposingTeamId] = useState('')
  const [formError, setFormError] = useState('')

  // No ground explicitly picked yet — default to the first one without
  // storing a redundant copy of it in state (see handleSelectGround for
  // the explicit-choice path).
  const effectiveGround = selectedGround || (grounds.length > 0 ? grounds[0] : null)

  const { create, loading, error: createError } = useMatchProposals(effectiveGround?.id)

  useEffect(() => {
    const fetchTeams = async () => {
      setTeamsLoading(true)
      try {
        const response = await fetch('/api/teams')
        if (!response.ok) throw new Error('Failed to load teams')
        const data = await response.json()
        setTeams(data.teams || [])
      } catch (err) {
        console.error('Failed to load teams:', err)
        setTeams([])
      } finally {
        setTeamsLoading(false)
      }
    }
    fetchTeams()
  }, [])

  const handleSelectGround = (groundId) => {
    const ground = grounds.find((g) => g.id === groundId)
    setSelectedGround(ground)
    setSelectedSlot(null)
  }

  const handleTimeRangeClick = (slot) => {
    setSelectedSlot(slot)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')

    if (!player?.team_id) {
      setFormError('You must be part of a team to create a proposal.')
      return
    }

    if (!effectiveGround) {
      setFormError('Please select a ground.')
      return
    }

    if (!bookingDate || !selectedSlot) {
      setFormError('Please select a date and time slot.')
      return
    }

    if (!opposingTeamId) {
      setFormError('Please select the opposing team.')
      return
    }

    if (Number(opposingTeamId) === player.team_id) {
      setFormError('You cannot create a proposal against your own team.')
      return
    }

    const bookingDateObj = new Date(bookingDate)
    const today = new Date(todayDateInputValue())

    if (bookingDateObj < today) {
      setFormError('Proposal date must be in the future.')
      return
    }

    const [slotStart, slotEnd] = selectedSlot.split('-').map((t) => t.trim())
    const [startHour, startMin] = slotStart.split(':').map(Number)
    const [endHour, endMin] = slotEnd.split(':').map(Number)

    const startDt = new Date(bookingDateObj)
    startDt.setHours(startHour, startMin, 0)

    const endDt = new Date(bookingDateObj)
    endDt.setHours(endHour, endMin, 0)

    const payload = {
      proposing_team_id: player.team_id,
      opposing_team_id: Number(opposingTeamId),
      proposal_slot_start: startDt.toISOString(),
      proposal_slot_end: endDt.toISOString(),
    }

    const ok = await create(payload)
    if (ok) {
      navigate('/match-proposals')
    }
  }

  const minDate = todayDateInputValue()
  const maxDate = addDaysToDateStr(minDate, 30)

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat px-4 py-10 text-white sm:px-6 lg:px-8"
      style={{ backgroundImage: `linear-gradient(rgba(2,6,23,0.85), rgba(2,6,23,0.85)), url('/images/cricket-stadium.jpg')` }}
    >
      <div className="mx-auto max-w-2xl">
        <BackButton fallback="/match-proposals" />

        <h1 className="mt-6 text-3xl font-bold text-white">Create Match Proposal</h1>
        <p className="mt-2 text-slate-300">Propose a match to another team at a specific ground and time.</p>

        {!player?.team_id && (
          <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            You must be part of a team to create a proposal.
          </div>
        )}

        {formError && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
            <p className="text-sm text-rose-300">{formError}</p>
          </div>
        )}

        {(createError) && (
          <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {createError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-200">Ground</span>
            {groundsLoading ? (
              <p className="text-sm text-slate-400">Loading grounds…</p>
            ) : grounds.length === 0 ? (
              <p className="text-sm text-slate-400">No grounds available.</p>
            ) : (
              <select
                value={effectiveGround?.id || ''}
                onChange={(e) => handleSelectGround(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white"
              >
                <option value="" className="bg-slate-900">
                  — Select Ground —
                </option>
                {grounds.map((g) => (
                  <option key={g.id} value={g.id} className="bg-slate-900">
                    {g.name}
                  </option>
                ))}
              </select>
            )}
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-200">Opposing Team</span>
              {teamsLoading ? (
                <p className="text-sm text-slate-400">Loading teams…</p>
              ) : teams.length === 0 ? (
                <p className="text-sm text-slate-400">No teams available.</p>
              ) : (
                <select
                  value={opposingTeamId}
                  onChange={(e) => setOpposingTeamId(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white"
                >
                  <option value="" className="bg-slate-900">
                    — Select Team —
                  </option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id} className="bg-slate-900">
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-200">Date</span>
              <input
                type="date"
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                min={minDate}
                max={maxDate}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-200">Time Slot</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {['06:00-07:00', '07:00-08:00', '08:00-09:00', '09:00-10:00', '10:00-11:00', '11:00-12:00', '14:00-15:00', '15:00-16:00', '16:00-17:00', '17:00-18:00', '18:00-19:00', '19:00-20:00'].map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => handleTimeRangeClick(slot)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    selectedSlot === slot
                      ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                      : 'border-white/15 bg-white/5 text-slate-300 hover:border-white/30 hover:bg-white/10'
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          </label>

          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={loading || !player?.team_id}
              className="h-11 flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {loading ? 'Creating…' : 'Create Proposal'}
            </Button>
            <button
              type="button"
              onClick={() => navigate('/match-proposals')}
              className="h-11 rounded-2xl border border-white/15 px-5 text-sm text-white transition-colors hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
