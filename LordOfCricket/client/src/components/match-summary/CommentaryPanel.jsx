import { useState } from 'react'
import { useMatchCommentary } from '../../hooks/useMatchCommentary.js'
import CommentaryEntry from './CommentaryEntry.jsx'

// The professional commentary feed. Filters operate on
// structured tags/types, never by parsing commentary text.
// Newest-first, matching the existing MatchTimelinePanel convention.
const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'BOUNDARIES', label: 'Boundaries' },
  { key: 'WICKETS', label: 'Wickets' },
  { key: 'MILESTONES', label: 'Milestones' },
]

function matchesFilter(entry, filter) {
  if (filter === 'ALL') return true
  if (filter === 'BOUNDARIES') return entry.tags?.includes('FOUR') || entry.tags?.includes('SIX')
  if (filter === 'WICKETS') return entry.type === 'WICKET'
  if (filter === 'MILESTONES') return entry.type === 'MILESTONE'
  return true
}

export default function CommentaryPanel({ matchId, inningsId }) {
  const [filter, setFilter] = useState('ALL')
  const { entries, loading, error, hasMore, loadMore, connected } = useMatchCommentary(matchId, { inningsId })

  const filtered = entries.filter((e) => matchesFilter(e, filter))

  return (
    <div className="space-y-3 rounded-[1.5rem] border border-loc-border bg-loc-surface p-4 shadow-sm backdrop-blur-sm sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-loc-faint">Commentary</p>
        <span className="text-[11px] text-loc-faint">{connected ? 'Live' : 'Reconnecting…'}</span>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-full border border-loc-border bg-loc-mint/40 p-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-loc-green ${
              filter === f.key ? 'bg-loc-green text-loc-navy' : 'text-loc-muted hover:bg-loc-mint'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && filtered.length === 0 && <div className="h-24 animate-pulse rounded-xl bg-loc-mint" role="status" aria-label="Loading commentary" />}
      {error && filtered.length === 0 && <p className="text-sm text-rose-300">Couldn&apos;t load commentary.</p>}
      {!loading && !error && filtered.length === 0 && <p className="text-sm text-loc-faint">No commentary yet.</p>}

      <div className="space-y-1.5">
        {filtered.map((entry) => (
          <CommentaryEntry key={entry.id} entry={entry} />
        ))}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          className="w-full rounded-full border border-loc-border py-2 text-xs font-semibold text-loc-muted transition-colors hover:bg-loc-mint focus-visible:outline focus-visible:outline-2 focus-visible:outline-loc-green"
        >
          Load older commentary
        </button>
      )}
    </div>
  )
}
