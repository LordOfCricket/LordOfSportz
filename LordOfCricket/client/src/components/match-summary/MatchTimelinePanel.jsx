import { ballLabel, ballClass } from './ballChip.js'

// Factual ball/event feed — never generated commentary text (
// this is NOT "AI Commentary"; a future addition may build that on top of this
// same structured feed). Newest-first, matching how a live ball-by-ball feed
// is conventionally read; the Overs tab covers the chronological scorecard
// reading order instead (one deliberate choice per tab, documented
// rather than adding a toggle).

const EVENT_LABEL = {
  'batsman-in': 'comes to the crease',
  'bowler-change': 'comes on to bowl',
  'strike-swap': 'strike swapped',
  retire: 'retired',
  'penalty-runs': 'penalty runs awarded',
  'catch-dropped': 'catch dropped',
  'fielding-event': 'fielding event',
  appeal: 'appeal',
  review: 'review',
  'drinks-break': 'drinks break',
  'rain-delay': 'rain delay',
  injury: 'injury break',
  'match-paused': 'match paused',
  'match-resumed': 'match resumed',
}

function DeliveryEntry({ d }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-loc-mint px-3 py-2">
      <span className="w-10 shrink-0 text-xs font-semibold text-loc-faint">
        {d.over}.{d.ball}
      </span>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ballClass(d)}`}>{ballLabel(d)}</span>
      <span className="text-sm text-loc-muted">
        {d.bowler?.name} to {d.striker?.name}
        {d.wicket && <span className="ml-1 font-semibold text-rose-300">— {d.wicket.dismissalText}</span>}
      </span>
    </div>
  )
}

function EventEntry({ e }) {
  const label = EVENT_LABEL[e.eventType] || e.eventType
  return (
    <div className="flex items-center gap-3 rounded-xl bg-loc-mint px-3 py-2">
      <span className="w-10 shrink-0 text-xs font-semibold text-loc-faint">
        {e.over}.{e.ball}
      </span>
      <span className="text-sm text-loc-faint">
        {e.payload?.player?.name ? `${e.payload.player.name} ${label}` : label}
      </span>
    </div>
  )
}

export default function MatchTimelinePanel({ innings }) {
  if (innings.timeline.length === 0) {
    return <p className="rounded-[1.5rem] border border-loc-border bg-loc-surface p-5 text-sm text-loc-faint">No timeline yet.</p>
  }
  const newestFirst = innings.timeline.slice().reverse()

  return (
    <div className="rounded-[1.5rem] border border-loc-border bg-loc-surface p-4 shadow-sm backdrop-blur-sm sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-loc-faint">Timeline</p>
      <div className="mt-3 space-y-1.5">
        {newestFirst.map((entry) => (entry.kind === 'delivery' ? <DeliveryEntry key={`d${entry.id}`} d={entry} /> : <EventEntry key={`e${entry.id}`} e={entry} />))}
      </div>
    </div>
  )
}
