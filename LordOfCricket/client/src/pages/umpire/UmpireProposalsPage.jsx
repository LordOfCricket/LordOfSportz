import { Gift } from 'lucide-react'
import UmpireLayout from '../../components/umpire-dashboard/UmpireLayout.jsx'
import { StatsLoadingGrid, StatsErrorState } from '../../components/stats/StatsStates.jsx'
import { useUmpireProposals } from '../../hooks/useUmpireProposals.js'
import { formatAmount } from '../../models/umpireEarnings.model.js'
import { proposalStatusLabel, proposalStatusClasses } from '../../models/umpireProposal.model.js'
import { formatMatchDate, formatMatchTime } from '../../models/matchDiscovery.model.js'

function ProposalCard({ proposal, busy, onRespond }) {
  const baseFee = proposal.umpire_fee_amount != null ? Number(proposal.umpire_fee_amount) : 0
  const bonus = Number(proposal.incentive_amount) || 0
  const total = baseFee + bonus
  const isPending = proposal.status === 'PENDING'

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-5 shadow-sm backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold text-white">
            {proposal.team_a_name} vs {proposal.team_b_name}
          </p>
          {proposal.ground_name && <p className="text-sm text-slate-300">{proposal.ground_name}</p>}
          <p className="mt-1 text-sm text-slate-400">
            {formatMatchDate(proposal.match_date)} · {formatMatchTime(proposal.match_date)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Proposed by {proposal.proposed_by_name}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${proposalStatusClasses(proposal.status)}`}>
          {proposalStatusLabel(proposal.status)}
        </span>
      </div>

      {proposal.message && <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">"{proposal.message}"</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {bonus > 0 && (
          <span className="flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-300">
            <Gift className="h-3.5 w-3.5" />+{formatAmount(bonus, proposal.currency)} bonus
          </span>
        )}
        <span className="font-semibold text-white">Total offered: {formatAmount(total, proposal.currency) || 'Not set'}</span>
      </div>

      {isPending && (
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => onRespond(proposal.id, true)}
            className="h-10 flex-1 rounded-2xl bg-linear-to-r from-green-700 via-green-500 to-lime-500 text-sm font-semibold text-white shadow-md shadow-green-900/40 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Accept'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRespond(proposal.id, false)}
            className="h-10 flex-1 rounded-2xl border border-rose-400/30 text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Decline'}
          </button>
        </div>
      )}
    </div>
  )
}

// Umpire Proposals — the umpire's own inbox of offers a Ground Owner has
// sent them directly, private to this umpire (never shown as a public
// "boosted" signal on the match itself).
export default function UmpireProposalsPage() {
  const { proposals, loading, error, refresh, respond, busyId, actionError } = useUmpireProposals()

  return (
    <UmpireLayout title="Proposals" subtitle="Offers Ground Owners have sent you directly, sometimes with a bonus on top of the base fee.">
      {loading && <StatsLoadingGrid tiles={2} />}
      {!loading && error && <StatsErrorState message={error} onRetry={refresh} />}

      {!loading && !error && (
        <div className="space-y-4">
          {actionError && <p className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{actionError}</p>}

          {proposals.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-16 text-center">
              <Gift className="h-8 w-8 text-slate-500" />
              <p className="text-slate-300">No proposals yet — Ground Owners can invite you directly to an open slot.</p>
            </div>
          ) : (
            proposals.map((p) => <ProposalCard key={p.id} proposal={p} busy={busyId === p.id} onRespond={respond} />)
          )}
        </div>
      )}
    </UmpireLayout>
  )
}
