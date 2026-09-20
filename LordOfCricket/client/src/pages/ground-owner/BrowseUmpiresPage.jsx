import { useCallback, useEffect, useState } from 'react'
import { Search, Star, Gift } from 'lucide-react'
import { fetchTopUmpires } from '../../services/umpireLeaderboardApi.js'
import { StatsLoadingGrid, StatsErrorState } from '../../components/stats/StatsStates.jsx'
import ReputationBadges from '../../components/common/ReputationBadges.jsx'
import BackButton from '../../components/common/BackButton.jsx'
import GroundOwnerLayout from '../../components/ground-owner/GroundOwnerLayout.jsx'
import ProposeToUmpireModal from '../../components/ground-owner/ProposeToUmpireModal.jsx'

const PAGE_SIZE = 20

// Umpire Proposals — the Ground Owner's mirror of the umpire's own "Grounds
// for Umpire" browse experience: every approved umpire, ranked the same
// deterministic way Top Umpires already ranks them (reused as-is, no new
// backend list endpoint), with a "Propose" action that opens
// ProposeToUmpireModal to pick one of the owner's own open slots.
export default function BrowseUmpiresPage() {
  const [offset, setOffset] = useState(0)
  const [board, setBoard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [proposingTo, setProposingTo] = useState(null)
  const [sentFor, setSentFor] = useState(null)

  const load = useCallback(() => {
    return fetchTopUmpires({ limit: PAGE_SIZE, offset })
      .then((data) => {
        setBoard(data)
        setError('')
      })
      .catch((err) => setError(err.response?.data?.message || err.response?.data?.error || "Couldn't load umpires."))
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
    <GroundOwnerLayout>
      <BackButton label="Back to Dashboard" fallback="/ground-owner/dashboard" />

      <div className="mt-4 flex items-center gap-3">
        <Search className="h-7 w-7 text-emerald-300" />
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Browse Umpires</h1>
      </div>
      <p className="mt-1 text-sm text-slate-300">
        Every approved umpire on LOC. Send a proposal for one of your open slots — optionally with a private bonus.
      </p>

      {sentFor && (
        <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Proposal sent to {sentFor}.
        </div>
      )}

      <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
        {loading && <StatsLoadingGrid tiles={6} />}
        {!loading && error && <StatsErrorState message={error} onRetry={load} />}

        {!loading && !error && board && (
          <>
            {board.items.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-16 text-center text-sm text-slate-300">
                No approved umpires yet.
              </div>
            )}

            {board.items.length > 0 && (
              <div className="space-y-2">
                {board.items.map((item) => (
                  <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="w-6 shrink-0 text-center text-sm font-bold text-slate-400">#{item.rank}</span>
                        <div>
                          <p className="text-sm font-semibold text-white">{item.name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                            {item.reputation?.ratingCount > 0 && (
                              <span className="flex items-center gap-1 text-amber-300">
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                {Number(item.reputation.ratingAvg).toFixed(1)}
                              </span>
                            )}
                            {item.reputation?.reliability != null && <span>Reliability {item.reputation.reliability}%</span>}
                            <span>{item.reputation?.matchesOfficiated ?? 0} Matches</span>
                          </div>
                          <div className="mt-1">
                            <ReputationBadges verified={item.reputation?.verified} badges={item.reputation?.badges} size="sm" />
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setProposingTo(item)}
                        className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-950 transition-colors hover:bg-emerald-400"
                      >
                        <Gift className="h-3.5 w-3.5" />
                        Propose
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {board.total > PAGE_SIZE && (
              <div className="mt-6 flex items-center justify-between text-sm text-slate-300">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => changePage(Math.max(0, offset - PAGE_SIZE))}
                  className="rounded-full border border-white/10 px-4 py-2 font-semibold transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
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
                  className="rounded-full border border-white/10 px-4 py-2 font-semibold transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {proposingTo && (
        <ProposeToUmpireModal
          candidate={proposingTo}
          onClose={() => setProposingTo(null)}
          onSent={() => setSentFor(proposingTo.name)}
        />
      )}
    </GroundOwnerLayout>
  )
}
