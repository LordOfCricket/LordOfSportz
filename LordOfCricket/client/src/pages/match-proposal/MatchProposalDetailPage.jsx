import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CalendarDays, Clock, AlertCircle } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth.js'
import { useMatchProposals } from '../../hooks/useMatchProposals.js'
import { proposalStatusLabel, proposalStatusClasses } from '../../models/matchProposal.model.js'
import { formatBookingDate, formatSlotTime } from '../../models/booking.model.js'
import BackButton from '../../components/common/BackButton.jsx'
import Button from '../../components/ui/Button.jsx'

export default function MatchProposalDetailPage() {
  const navigate = useNavigate()
  const { publicProposalId } = useParams()
  const [searchParams] = useSearchParams()
  const groundId = searchParams.get('groundId')
  const { player } = useAuth()
  const [proposal, setProposal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState('')

  const { accept } = useMatchProposals(groundId)

  useEffect(() => {
    const loadProposal = async () => {
      if (!groundId) {
        setError('Ground ID is required')
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const response = await fetch(`/api/grounds/${groundId}/proposals/${publicProposalId}`)
        if (!response.ok) throw new Error('Failed to load proposal')
        const data = await response.json()
        setProposal(data.proposal)
      } catch (err) {
        setError(err.message || 'Unable to load proposal.')
      } finally {
        setLoading(false)
      }
    }
    loadProposal()
  }, [publicProposalId, groundId])

  const handleAccept = async () => {
    if (!player?.team_id) {
      setAcceptError('You must be part of a team to accept a proposal.')
      return
    }

    if (proposal.proposing_team_id === player.team_id) {
      setAcceptError('You cannot accept your own proposal.')
      return
    }

    setAccepting(true)
    setAcceptError('')

    const ok = await accept(publicProposalId, {
      accepting_team_id: player.team_id,
    })

    setAccepting(false)

    if (ok) {
      navigate('/match-proposals')
    }
  }

  const handleCancel = async () => {
    if (!proposal || !groundId) return
    setAccepting(true)
    try {
      const response = await fetch(`/api/grounds/${groundId}/proposals/${publicProposalId}/cancel`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to cancel proposal')
      navigate('/match-proposals')
    } catch (err) {
      setAcceptError(err.message || 'Failed to cancel proposal.')
    } finally {
      setAccepting(false)
    }
  }

  const canAccept =
    proposal && proposal.status === 'OPEN' && player?.team_id && proposal.proposing_team_id !== player.team_id

  const isProposer = proposal && player && proposal.created_by === player.id

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat px-4 py-10 text-white sm:px-6 lg:px-8"
      style={{ backgroundImage: `linear-gradient(rgba(2,6,23,0.85), rgba(2,6,23,0.85)), url('/images/cricket-stadium.jpg')` }}
    >
      <div className="mx-auto max-w-2xl">
        <BackButton fallback="/match-proposals" />

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Loading proposal…</p>
        ) : error ? (
          <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        ) : proposal ? (
          <>
            <h1 className="mt-6 text-3xl font-bold text-white">Match Proposal</h1>

            {acceptError && (
              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3">
                <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
                <p className="text-sm text-rose-300">{acceptError}</p>
              </div>
            )}

            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-300">{proposal.ground_name}</p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {proposal.proposing_team_name} seeking match
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${proposalStatusClasses(proposal.status)}`}>
                  {proposalStatusLabel(proposal.status)}
                </span>
              </div>

              <div className="mt-6 space-y-3 border-t border-white/10 pt-6">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">Date</p>
                  <p className="mt-1 flex items-center gap-2 text-sm text-white">
                    <CalendarDays className="h-4 w-4 text-emerald-300" />
                    {formatBookingDate(proposal.proposal_slot_start)}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">Time</p>
                  <p className="mt-1 flex items-center gap-2 text-sm text-white">
                    <Clock className="h-4 w-4 text-slate-300" />
                    {formatSlotTime(proposal.proposal_slot_start, proposal.proposal_slot_end)}
                  </p>
                </div>

                {proposal.proposal_expires_at && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400">Expires</p>
                    <p className="mt-1 text-sm text-slate-300">
                      {new Date(proposal.proposal_expires_at).toLocaleString('en-IN', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">Proposer</p>
                  <p className="mt-1 text-sm text-white">{proposal.proposing_team_name}</p>
                </div>
              </div>

              {!player?.team_id && (
                <div className="mt-6 rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
                  You must be part of a team to accept this proposal.
                </div>
              )}

              <div className="mt-6 flex gap-3">
                {canAccept && (
                  <Button
                    onClick={handleAccept}
                    disabled={accepting}
                    className="h-11 flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    {accepting ? 'Accepting…' : 'Accept Proposal'}
                  </Button>
                )}

                {isProposer && proposal.status === 'OPEN' && (
                  <button
                    type="button"
                    disabled={accepting}
                    onClick={handleCancel}
                    className="h-11 flex-1 rounded-2xl border border-rose-400/30 bg-rose-500/10 text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    {accepting ? 'Cancelling…' : 'Withdraw Proposal'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => navigate('/match-proposals')}
                  className="h-11 rounded-2xl border border-white/15 px-5 text-sm text-white transition-colors hover:bg-white/10"
                >
                  Close
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </main>
  )
}
