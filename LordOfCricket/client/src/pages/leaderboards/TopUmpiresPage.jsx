import { useCallback, useEffect, useState } from 'react'
import { Trophy, Star } from 'lucide-react'
import { fetchTopUmpires } from '../../services/umpireLeaderboardApi.js'
import { StatsLoadingGrid, StatsErrorState } from '../../components/stats/StatsStates.jsx'
import ReputationBadges from '../../components/common/ReputationBadges.jsx'
import BackButton from '../../components/common/BackButton.jsx'

const PAGE_SIZE = 20

// Umpire Intelligence & Scale 2.0, Workstreams T/U — "Top Umpires",
// deliberately its own page, never merged into the player Leaderboards
// page/data. Ranked by the same deterministic model the Ground Owner's
// recommendation list uses (rating/reliability/experience, sample-aware),
// never by raw rating alone.
export default function TopUmpiresPage() {
  const [offset, setOffset] = useState(0)
  const [board, setBoard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    return fetchTopUmpires({ limit: PAGE_SIZE, offset })
      .then((data) => {
        setBoard(data)
        setError('')
      })
      .catch((err) => setError(err.response?.data?.message || err.response?.data?.error || "Couldn't load the umpire leaderboard."))
      .finally(() => setLoading(false))
  }, [offset])

  useEffect(() => {
    load()
  }, [load])

  const changePage = (nextOffset) => {
    setLoading(true)
    setOffset(nextOffset)
  }

  return (
    <main className="loc-page px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <BackButton fallback="/leaderboards" />

        <div className="mt-4 flex items-center gap-3">
          <Trophy className="h-7 w-7 text-amber-700" />
          <h1 className="text-3xl font-bold text-loc-navy">Top Umpires</h1>
        </div>
        <p className="mt-1 text-sm text-loc-muted">Ranked by rating, reliability, and experience together — never rating alone.</p>

        <div className="mt-6 loc-card p-6">
          {loading && <StatsLoadingGrid tiles={6} light />}
          {!loading && error && <StatsErrorState message={error} onRetry={load} light />}

          {!loading && !error && board && (
            <>
              {board.items.length === 0 && (
                <div className="rounded-2xl border border-dashed border-loc-border bg-loc-mint px-6 py-16 text-center text-sm text-loc-muted">
                  No approved umpires yet.
                </div>
              )}

              {board.items.length > 0 && (
                <div className="space-y-2">
                  {board.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl loc-card px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="w-6 shrink-0 text-center text-sm font-bold text-loc-faint">#{item.rank}</span>
                        <div>
                          <p className="text-sm font-semibold text-loc-navy">{item.name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-loc-faint">
                            {item.reputation?.ratingCount > 0 && (
                              <span className="flex items-center gap-1 text-amber-700">
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                {Number(item.reputation.ratingAvg).toFixed(1)}
                              </span>
                            )}
                            {item.reputation?.reliability != null && <span>Reliability {item.reputation.reliability}%</span>}
                            <span>{item.reputation?.matchesOfficiated ?? 0} Matches</span>
                          </div>
                        </div>
                      </div>
                      <ReputationBadges verified={item.reputation?.verified} badges={item.reputation?.badges} size="sm" light />
                    </div>
                  ))}
                </div>
              )}

              {board.total > PAGE_SIZE && (
                <div className="mt-6 flex items-center justify-between text-sm text-loc-muted">
                  <button
                    type="button"
                    disabled={offset === 0}
                    onClick={() => changePage(Math.max(0, offset - PAGE_SIZE))}
                    className="rounded-full border border-loc-border px-4 py-2 font-semibold transition-colors hover:bg-loc-mint disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span>
                    #{offset + 1}–#{Math.min(offset + PAGE_SIZE, board.total)} of {board.total}
                  </span>
                  <button
                    type="button"
                    disabled={offset + PAGE_SIZE >= board.total}
                    onClick={() => changePage(offset + PAGE_SIZE)}
                    className="rounded-full border border-loc-border px-4 py-2 font-semibold transition-colors hover:bg-loc-mint disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}
