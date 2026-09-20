import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, Clock, Plus } from 'lucide-react'
import { useMatchProposals } from '../../hooks/useMatchProposals.js'
import { proposalStatusLabel, proposalStatusClasses } from '../../models/matchProposal.model.js'
import { formatBookingDate, formatSlotTime } from '../../models/booking.model.js'
import BackButton from '../../components/common/BackButton.jsx'
import Button from '../../components/ui/Button.jsx'

const FILTER_OPTIONS = [
  { value: 'all', label: 'All Proposals' },
  { value: 'OPEN', label: 'Open' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

function ProposalCard({ proposal, groundName, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition-colors hover:bg-white/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-300">{groundName || 'Ground'}</p>
          <p className="mt-1 text-base font-bold text-white">
            {proposal.proposingTeamName} seeking match
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-white">
            <CalendarDays className="h-4 w-4 text-emerald-300" />
            {formatBookingDate(proposal.startTime)}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-300">
            <Clock className="h-4 w-4 text-slate-400" />
            {formatSlotTime(proposal.startTime, proposal.endTime)}
          </p>
          {proposal.proposalExpiresAt && (
            <p className="mt-2 text-xs text-slate-400">
              Expires: {new Date(proposal.proposalExpiresAt).toLocaleString('en-IN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${proposalStatusClasses(proposal.status)}`}>
          {proposalStatusLabel(proposal.status)}
        </span>
      </div>
    </button>
  )
}

export default function MatchProposalsDiscoveryPage() {
  const navigate = useNavigate()
  const [selectedGround, setSelectedGround] = useState(null)
  const [filter, setFilter] = useState('OPEN')
  const [grounds, setGrounds] = useState([])
  const [groundsLoading, setGroundsLoading] = useState(true)

  useEffect(() => {
    const fetchGrounds = async () => {
      try {
        const response = await fetch('/api/grounds')
        if (!response.ok) throw new Error('Failed to load grounds')
        const data = await response.json()
        if (data.grounds && data.grounds.length > 0) {
          setGrounds(data.grounds)
          setSelectedGround(data.grounds[0])
        }
      } catch (err) {
        console.error('Failed to load grounds:', err)
      } finally {
        setGroundsLoading(false)
      }
    }
    fetchGrounds()
  }, [])

  const { proposals, loading, error } = useMatchProposals(selectedGround?.id)

  const filteredProposals = filter === 'all' ? proposals : proposals.filter((p) => p.status === filter)

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat px-4 py-10 text-white sm:px-6 lg:px-8"
      style={{ backgroundImage: `linear-gradient(rgba(2,6,23,0.85), rgba(2,6,23,0.85)), url('/images/cricket-stadium.jpg')` }}
    >
      <div className="mx-auto max-w-3xl">
        <BackButton fallback="/" />

        <h1 className="mt-6 text-3xl font-bold text-white">Match Proposals</h1>
        <p className="mt-2 text-slate-300">Browse open match proposals from other teams and accept to confirm the match.</p>

        {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}

        <div className="mt-6 space-y-4">
          {!groundsLoading && grounds.length > 0 && (
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-200">Select Ground</span>
              <select
                value={selectedGround?.id || ''}
                onChange={(e) => {
                  const g = grounds.find((g) => g.id === Number(e.target.value))
                  setSelectedGround(g || null)
                }}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white"
              >
                {grounds.map((g) => (
                  <option key={g.id} value={g.id} className="bg-slate-900">
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-200">Filter by Status</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white"
            >
              {FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-slate-900">
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Loading proposals…</p>
        ) : filteredProposals.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-12 text-center">
            <p className="text-slate-300">No proposals found matching the selected filter.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {filteredProposals.map((p) => (
              <ProposalCard
                key={p.publicProposalId}
                proposal={p}
                groundName={selectedGround?.name}
                onClick={() => navigate(`/match-proposals/${p.publicProposalId}?groundId=${selectedGround?.id}`)}
              />
            ))}
          </div>
        )}

        <Button onClick={() => navigate('/match-proposal/create')} className="mt-8 h-11 bg-emerald-600 px-5 text-sm text-white">
          <Plus className="h-4 w-4" /> Create Proposal
        </Button>
      </div>
    </main>
  )
}
