import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { useMyGrounds } from '../../hooks/useMyGrounds.js'
import GroundOwnerLayout from '../../components/ground-owner/GroundOwnerLayout.jsx'
import { StatsErrorState } from '../../components/stats/StatsStates.jsx'
import BackButton from '../../components/common/BackButton.jsx'

function GroundCard({ ground }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-white">{ground.name}</p>
          {(ground.city || ground.state) && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
              <MapPin className="h-4 w-4 shrink-0" />
              {[ground.city, ground.state].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase ${
            ground.status === 'ACTIVE' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-slate-300'
          }`}
        >
          {ground.status}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Upcoming Matches</p>
          <p className="mt-1 text-xl font-bold text-white">{ground.upcomingMatchesCount}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Umpire Slots</p>
          <p className="mt-1 text-xl font-bold text-white">
            {ground.umpireSlotsFilled} / {ground.umpireSlotsTotal}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Link
          to={`/ground-owner/grounds/${ground.public_ground_id}`}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-linear-to-r from-green-700 via-green-500 to-lime-500 text-sm font-semibold text-white shadow-md shadow-green-900/40 transition-all hover:brightness-110"
        >
          Manage Ground
        </Link>
        <Link
          to={`/ground-owner/grounds/${ground.public_ground_id}/staff`}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-sm font-semibold text-white transition-all hover:bg-white/10"
        >
          Staff
        </Link>
      </div>
    </div>
  )
}

function CardSkeleton() {
  return <div className="h-56 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/5" />
}

export default function GroundOwnerDashboardPage() {
  const { grounds, loading, error, refresh } = useMyGrounds()

  return (
    <GroundOwnerLayout title="Ground Owner Dashboard">
      <BackButton fallback="/" className="mb-4" />
      <h2 className="text-xl font-semibold text-white">My Grounds</h2>

      <div className="mt-4">
        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )}
        {!loading && error && <StatsErrorState message={error} onRetry={refresh} />}
        {!loading && !error && grounds.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-16 text-center">
            <MapPin className="h-8 w-8 text-slate-500" />
            <p className="text-slate-300">You don't manage any grounds yet.</p>
          </div>
        )}
        {!loading && !error && grounds.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {grounds.map((ground) => (
              <GroundCard key={ground.id} ground={ground} />
            ))}
          </div>
        )}
      </div>
    </GroundOwnerLayout>
  )
}
