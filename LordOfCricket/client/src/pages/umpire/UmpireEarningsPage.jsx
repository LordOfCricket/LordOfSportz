import UmpireLayout from '../../components/umpire-dashboard/UmpireLayout.jsx'
import { StatsLoadingGrid, StatsErrorState } from '../../components/stats/StatsStates.jsx'
import StatTile from '../../components/stats/StatTile.jsx'
import { useUmpireEarnings } from '../../hooks/useUmpireEarnings.js'
import { formatAmount, paymentStatusLabel, paymentStatusClasses } from '../../models/umpireEarnings.model.js'
import { formatMatchDate } from '../../models/matchDiscovery.model.js'

export default function UmpireEarningsPage() {
  const { summary, recent, loading, error, refresh } = useUmpireEarnings()

  return (
    <UmpireLayout title="My Earnings" subtitle="Your umpiring fees and payment status at a glance.">
      {loading && <StatsLoadingGrid tiles={3} />}
      {!loading && error && <StatsErrorState message={error} onRetry={refresh} />}

      {!loading && !error && summary && (
        <div className="space-y-6">
          {!summary.hasAnyData ? (
            <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 text-center shadow-sm backdrop-blur-sm">
              <p className="text-sm text-slate-400">No earnings data yet — this appears once a Ground Owner sets a fee and you complete a match.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatTile label="This Month" value={formatAmount(summary.thisMonth) ?? '—'} emphasis />
                <StatTile label="Pending" value={formatAmount(summary.pending) ?? '—'} />
                <StatTile label="Paid" value={formatAmount(summary.paid) ?? '—'} />
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
                <h2 className="text-xl font-semibold text-white">Recent Matches</h2>
                <div className="mt-4 space-y-2">
                  {recent.map((e) => (
                    <div key={e.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{e.groundName || `${e.teamAName} vs ${e.teamBName}`}</p>
                        <p className="text-xs text-slate-400">{formatMatchDate(e.matchDate)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-white">{formatAmount(e.amount, e.currency)}</p>
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${paymentStatusClasses(e.status)}`}>
                          {paymentStatusLabel(e.status)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </UmpireLayout>
  )
}
