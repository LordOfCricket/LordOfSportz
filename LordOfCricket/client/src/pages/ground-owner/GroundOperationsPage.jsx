import { useParams } from 'react-router-dom'
import { CalendarClock, Ban, Trophy, PackageX } from 'lucide-react'
import GroundOwnerLayout from '../../components/ground-owner/GroundOwnerLayout.jsx'
import GroundNavTabs from '../../components/ground-owner/GroundNavTabs.jsx'
import { StatsErrorState, StatsLoadingGrid } from '../../components/stats/StatsStates.jsx'
import StatTile from '../../components/stats/StatTile.jsx'
import { useGroundDashboard } from '../../hooks/useGroundDashboard.js'
import { formatAmount } from '../../models/umpireEarnings.model.js'

const STATUS_LABELS = {
  MATCH_DAY: 'Match Day',
  PARTIALLY_BLOCKED: 'Partially Blocked',
  BOOKED: 'Booked',
  OPEN: 'Open',
}

const STATUS_CLASSES = {
  MATCH_DAY: 'bg-amber-500/15 text-amber-300',
  PARTIALLY_BLOCKED: 'bg-orange-500/15 text-orange-300',
  BOOKED: 'bg-blue-500/15 text-blue-300',
  OPEN: 'bg-emerald-500/15 text-emerald-300',
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

function TodayList({ dashboard }) {
  const { bookings, blocks, matches } = dashboard.today
  const hasAny = bookings.length > 0 || blocks.length > 0 || matches.length > 0

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-10 text-center">
        <CalendarClock className="h-8 w-8 text-slate-500" />
        <p className="text-sm text-slate-300">No bookings, blocks, or matches scheduled today.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {matches.map((m) => (
        <div key={`match-${m.matchId}`} className="flex items-center justify-between rounded-2xl border border-amber-400/20 bg-amber-500/5 px-4 py-3">
          <div className="flex items-center gap-3">
            <Trophy className="h-4 w-4 shrink-0 text-amber-300" />
            <div>
              <p className="text-sm font-semibold text-white">{m.teamA} vs {m.teamB}</p>
              {m.tournamentName && <p className="text-xs text-slate-400">{m.tournamentName}{m.stage ? ` — ${m.stage}` : ''}</p>}
            </div>
          </div>
          <span className="text-xs font-semibold uppercase text-amber-300">{m.status}</span>
        </div>
      ))}
      {bookings.map((b) => (
        <div key={`booking-${b.publicBookingId}`} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">{b.purpose || 'Booking'}</p>
            <p className="text-xs text-slate-400">{formatTime(b.startTime)} – {formatTime(b.endTime)}</p>
          </div>
        </div>
      ))}
      {blocks.map((b) => (
        <div key={`block-${b.publicBookingId}`} className="flex items-center justify-between rounded-2xl border border-slate-500/20 bg-slate-500/5 px-4 py-3">
          <div className="flex items-center gap-3">
            <Ban className="h-4 w-4 shrink-0 text-slate-400" />
            <div>
              <p className="text-sm font-semibold text-white">{b.blockType || 'Staff Block'}</p>
              <p className="text-xs text-slate-400">{formatTime(b.startTime)} – {formatTime(b.endTime)}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function UpcomingList({ dashboard }) {
  const { blocks, matches } = dashboard.upcoming7Days
  const hasAny = blocks.length > 0 || matches.length > 0

  if (!hasAny) {
    return <p className="text-sm text-slate-400">Nothing else scheduled in the next 7 days.</p>
  }

  return (
    <div className="space-y-2">
      {matches.map((m) => (
        <div key={`upcoming-match-${m.matchId}`} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm">
          <span className="text-white">{m.teamA} vs {m.teamB}</span>
          <span className="text-slate-400">{formatDate(m.matchDate)}</span>
        </div>
      ))}
      {blocks.map((b) => (
        <div key={`upcoming-block-${b.publicBookingId}`} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm">
          <span className="text-white">{b.blockType || 'Staff Block'}</span>
          <span className="text-slate-400">{formatDate(b.startTime)}</span>
        </div>
      ))}
    </div>
  )
}

// Phase 16 — current/next booking, derived server-side from today.bookings
// (no separate fetch); a simple highlight pair rather than a new widget
// framework.
function CurrentNextBooking({ dashboard }) {
  const { currentBooking, nextBooking } = dashboard.today
  if (!currentBooking && !nextBooking) return null
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {currentBooking && (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">Current Booking</p>
          <p className="mt-1 text-sm font-semibold text-white">{formatTime(currentBooking.startTime)} – {formatTime(currentBooking.endTime)}</p>
        </div>
      )}
      {nextBooking && (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Next Booking</p>
          <p className="mt-1 text-sm font-semibold text-white">{formatTime(nextBooking.startTime)} – {formatTime(nextBooking.endTime)}</p>
        </div>
      )}
    </div>
  )
}

// Phase 16 — canteen operational snapshot for today.
function CanteenSection({ canteen }) {
  const statusEntries = Object.entries(canteen.ordersByStatus || {})
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-white">Canteen Today</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Revenue" value={formatAmount(canteen.revenue)} emphasis />
        <StatTile label="Orders" value={canteen.orderCount} />
        {statusEntries.map(([status, count]) => (
          <StatTile key={status} label={status} value={count} />
        ))}
      </div>

      {canteen.lowStockItems.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/5 px-4 py-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300">
            <PackageX size={16} /> Low Stock
          </p>
          <div className="flex flex-wrap gap-2">
            {canteen.lowStockItems.map((item) => (
              <span key={item.name} className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-200">
                {item.name} — {item.stock} left
              </span>
            ))}
          </div>
        </div>
      )}

      {canteen.topItems.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-slate-300">Top Selling</p>
          <div className="flex flex-wrap gap-2">
            {canteen.topItems.map((item) => (
              <span key={item.name} className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-200">
                {item.name} × {item.quantitySold}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

// Phase 16 — staff summary composed from existing membership data.
function StaffSection({ staff }) {
  const roleEntries = Object.entries(staff.roleBreakdown || {})
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-white">Staff</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Active" value={staff.active} emphasis />
        <StatTile label="Inactive" value={staff.inactive} />
        {roleEntries.map(([role, count]) => (
          <StatTile key={role} label={role.replace('_', ' ')} value={count} />
        ))}
      </div>
    </section>
  )
}

export default function GroundOperationsPage() {
  const { publicGroundId } = useParams()
  const { dashboard, loading, error, refresh } = useGroundDashboard(publicGroundId)

  return (
    <GroundOwnerLayout>
      <div className="lg:flex lg:items-start lg:gap-6">
        <GroundNavTabs />

        <div className="min-w-0 flex-1">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">Operations</h1>
          <p className="mt-2 text-slate-400">Today's activity and what's coming up at this ground.</p>
        </div>
        {dashboard && (
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase ${STATUS_CLASSES[dashboard.groundStatus] || STATUS_CLASSES.OPEN}`}>
            {STATUS_LABELS[dashboard.groundStatus] || dashboard.groundStatus}
          </span>
        )}
      </div>

      {loading && <StatsLoadingGrid tiles={3} />}
      {!loading && error && <StatsErrorState message={error} onRetry={refresh} />}

      {!loading && !error && dashboard && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatTile label="Bookings Today" value={dashboard.today.bookingsCount} />
            <StatTile label="Staff Blocks Today" value={dashboard.today.blocksCount} />
            <StatTile label="Matches Today" value={dashboard.today.matchesCount} emphasis={dashboard.today.matchesCount > 0} />
            <StatTile label="Available Slots" value={dashboard.today.availableSlotsCount} />
            <StatTile label="Blocked Slots" value={dashboard.today.blockedSlotsCount} />
          </div>

          <CurrentNextBooking dashboard={dashboard} />

          <section>
            <h2 className="mb-3 text-lg font-bold text-white">Today's Schedule</h2>
            <TodayList dashboard={dashboard} />
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-white">Next 7 Days</h2>
            <UpcomingList dashboard={dashboard} />
          </section>

          <CanteenSection canteen={dashboard.canteen} />
          <StaffSection staff={dashboard.staff} />
        </div>
      )}
        </div>
      </div>
    </GroundOwnerLayout>
  )
}
