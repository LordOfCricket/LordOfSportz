import { CalendarClock } from 'lucide-react'
import { useMyAssignments } from '../../hooks/useMyAssignments.js'
import UmpireLayout from '../../components/umpire-dashboard/UmpireLayout.jsx'
import AssignmentCard from '../../components/umpire-dashboard/AssignmentCard.jsx'
import { StatsErrorState } from '../../components/stats/StatsStates.jsx'

function CardSkeleton() {
  return <div className="h-48 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/5" />
}

function Section({ title, items, cancellingId, onCancel }) {
  if (items.length === 0) return null
  return (
    <div className="mt-8 first:mt-0">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {items.map((a) => (
          <AssignmentCard key={a.match_id} assignment={a} cancelling={cancellingId === a.match_id} onCancel={onCancel} />
        ))}
      </div>
    </div>
  )
}

export default function MyAssignmentsPage() {
  const { upcoming, live, completed, cancelled, noShow, loading, error, cancellingId, cancel, refresh } = useMyAssignments()
  const hasAny = upcoming.length + live.length + completed.length + cancelled.length + noShow.length > 0

  return (
    <UmpireLayout title="My Matches" subtitle="Matches assigned to you as umpire.">
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && error && <StatsErrorState message={error} onRetry={refresh} />}

      {!loading && !error && !hasAny && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-16 text-center">
          <CalendarClock className="h-8 w-8 text-slate-500" />
          <p className="text-slate-300">You don't have any upcoming umpire assignments.</p>
        </div>
      )}

      {!loading && !error && hasAny && (
        <>
          <Section title="Live" items={live} cancellingId={cancellingId} onCancel={cancel} />
          <Section title="Upcoming" items={upcoming} cancellingId={cancellingId} onCancel={cancel} />
          <Section title="Completed" items={completed} cancellingId={cancellingId} onCancel={cancel} />
          <Section title="No-Show" items={noShow} cancellingId={cancellingId} onCancel={cancel} />
          <Section title="Cancelled" items={cancelled} cancellingId={cancellingId} onCancel={cancel} />
        </>
      )}
    </UmpireLayout>
  )
}
