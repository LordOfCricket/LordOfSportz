import { useNavigate } from 'react-router-dom'
import { History } from 'lucide-react'
import { useCareerStats } from '../../hooks/useCareerStats.js'
import { StatsLoadingGrid, StatsErrorState } from '../stats/StatsStates.jsx'
import RecentFormStrip from '../stats/RecentFormStrip.jsx'

export default function RecentMatches() {
  const { stats, loading, error, retry } = useCareerStats()
  const navigate = useNavigate()

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
      <h2 className="text-xl font-semibold text-white">Recent Matches</h2>

      <div className="mt-4">
        {loading && <StatsLoadingGrid tiles={3} />}
        {!loading && error && <StatsErrorState message={error} onRetry={retry} />}
        {!loading && !error && (!stats || stats.recentForm.length === 0) && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-10 text-center">
            <History className="h-8 w-8 text-slate-500" />
            <p className="text-sm text-slate-300">No finalized matches recorded yet.</p>
          </div>
        )}
        {!loading && !error && stats && stats.recentForm.length > 0 && (
          <RecentFormStrip performances={stats.recentForm} onOpenMatch={(matchId) => navigate(`/matches/${matchId}/summary`)} />
        )}
      </div>
    </div>
  )
}
