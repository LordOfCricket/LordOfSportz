import { useState } from 'react'
import { useStaffBookingSchedule } from '../../hooks/useStaffBookingSchedule.js'
import BackButton from '../../components/common/BackButton.jsx'
import { useGroundTimeline, useGroundDashboard, useBookingHistory, useGroundReports, useAuditLog } from '../../hooks/useGroundOps.js'
import { formatBookingDate, formatSlotTime, GROUND_BLOCK_TYPES } from '../../models/booking.model.js'
import Button from '../../components/ui/Button.jsx'
import TimelineView from '../../components/ground/TimelineView.jsx'

const STATUS_BADGE = {
  CONFIRMED: 'bg-emerald-500/15 text-emerald-300',
  CANCELLED: 'bg-white/10 text-slate-400',
}

const TABS = ['Schedule', 'Timeline', 'Dashboard', 'History', 'Reports']

function isCancellable(booking) {
  return booking.status === 'CONFIRMED' && new Date(booking.startTime).getTime() > Date.now()
}

function ScheduleTab({ s }) {
  return (
    <>
      {s.error && <p className="mt-4 text-sm text-rose-300">{s.error}</p>}

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">From</span>
          <input type="date" value={s.from} onChange={(e) => s.setFrom(e.target.value)} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">To</span>
          <input type="date" value={s.to} onChange={(e) => s.setTo(e.target.value)} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
        </label>
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Bookings &amp; Blocks</h2>
        {s.loading ? (
          <p className="mt-3 text-sm text-slate-400">Loading…</p>
        ) : s.bookings.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-8 text-center text-sm text-slate-300">Nothing scheduled in this range.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {s.bookings.map((b) => (
              <div key={b.publicBookingId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {b.bookingType === 'STAFF_BLOCK' ? `Block — ${(b.blockType && GROUND_BLOCK_TYPES[b.blockType]) || b.purpose || 'Ground Block'}` : b.customerName}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatBookingDate(b.startTime)} · {formatSlotTime(b.startTime, b.endTime)}
                    {b.bookingType === 'CUSTOMER' && b.contactPhone ? ` · ${b.contactPhone}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${STATUS_BADGE[b.status] || 'bg-white/10 text-slate-300'}`}>{b.displayStatus || b.status}</span>
                  {isCancellable(b) && (
                    <button
                      type="button"
                      disabled={s.busyId === b.publicBookingId}
                      onClick={() => (b.bookingType === 'STAFF_BLOCK' ? s.removeBlock(b.publicBookingId) : s.cancelCustomerBooking(b.publicBookingId))}
                      className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
                    >
                      {b.bookingType === 'STAFF_BLOCK' ? 'Remove Block' : 'Cancel'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8 rounded-2xl border border-amber-400/20 bg-amber-500/5 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-200">Block a Time (Maintenance / Private Event / Closed)</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-400">Date</span>
            <input type="date" value={s.blockDate} onChange={(e) => s.setBlockDate(e.target.value)} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-400">Reason Type</span>
            <select value={s.blockType} onChange={(e) => s.setBlockType(e.target.value)} className="rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white">
              <option value="">Other / unspecified</option>
              {Object.entries(GROUND_BLOCK_TYPES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block flex-1 min-w-40">
            <span className="mb-1 block text-xs font-semibold text-slate-400">Notes</span>
            <input value={s.blockPurpose} onChange={(e) => s.setBlockPurpose(e.target.value)} placeholder="e.g. Pitch rolling before Sunday match" className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500" />
          </label>
          <Button onClick={s.loadBlockSlots} disabled={s.loadingBlockSlots} className="h-10 px-4 text-sm">
            {s.loadingBlockSlots ? 'Loading…' : 'Show Slots'}
          </Button>
        </div>

        {s.blockSlots.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {s.blockSlots
              .filter((slot) => slot.status === 'AVAILABLE')
              .map((slot) => (
                <button
                  key={slot.startTime}
                  type="button"
                  onClick={() => s.addBlock(slot.startTime)}
                  className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-500/20"
                >
                  {formatSlotTime(slot.startTime, slot.endTime)}
                </button>
              ))}
            {s.blockSlots.every((slot) => slot.status !== 'AVAILABLE') && <p className="col-span-full text-xs text-slate-400">No available slots that day.</p>}
          </div>
        )}
      </section>
    </>
  )
}

function TimelineTab() {
  const t = useGroundTimeline()
  return (
    <div className="mt-6">
      <label className="block w-fit">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Date</span>
        <input type="date" value={t.date} onChange={(e) => t.setDate(e.target.value)} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
      </label>
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5">
        {t.loading && <p className="text-sm text-slate-400">Loading…</p>}
        {t.error && <p className="text-sm text-rose-300">{t.error}</p>}
        {!t.loading && !t.error && t.timeline && <TimelineView segments={t.timeline.segments} />}
      </div>
    </div>
  )
}

function StatTile({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/10 p-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  )
}

const GROUND_STATUS_LABEL = { OPEN: 'Open', BOOKED: 'Booked', PARTIALLY_BLOCKED: 'Partially Blocked', MATCH_DAY: 'Match Day' }

function DashboardTab() {
  const { dashboard, loading, error } = useGroundDashboard()
  const audit = useAuditLog()

  if (loading) return <p className="mt-6 text-sm text-slate-400">Loading…</p>
  if (error || !dashboard) return <p className="mt-6 text-sm text-rose-300">{error || 'Unable to load dashboard.'}</p>

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Ground Status" value={GROUND_STATUS_LABEL[dashboard.groundStatus] || dashboard.groundStatus} />
        <StatTile label="Today's Bookings" value={dashboard.todayBookingsCount} />
        <StatTile label="Today's Blocks" value={dashboard.todayBlocksCount} />
        <StatTile label="Pending Requests" value={dashboard.pendingRequestsCount} />
      </div>

      {dashboard.todayMatches.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Today's Matches</h3>
          <div className="mt-2 space-y-2">
            {dashboard.todayMatches.map((m) => (
              <div key={m.matchId} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                {m.teamA} vs {m.teamB} {m.tournamentName ? `· ${m.tournamentName}` : ''}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Upcoming Maintenance (Next 7 Days)</h3>
        {dashboard.upcomingMaintenance.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">None scheduled.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {dashboard.upcomingMaintenance.map((b) => (
              <div key={b.publicBookingId} className="rounded-xl border border-amber-400/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
                {b.label} — {formatBookingDate(b.startTime)} · {formatSlotTime(b.startTime, b.endTime)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Upcoming Tournament Fixtures</h3>
        {dashboard.upcomingTournamentFixtures.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">None scheduled.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {dashboard.upcomingTournamentFixtures.map((f) => (
              <div key={f.matchId} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                {f.teamA} vs {f.teamB} · {f.tournamentName} — {formatBookingDate(f.matchDate)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Recent Activity (Audit Log)</h3>
        {audit.loading ? (
          <p className="mt-2 text-sm text-slate-400">Loading…</p>
        ) : audit.entries.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No activity logged yet.</p>
        ) : (
          <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
            {audit.entries.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs text-slate-300">
                <span>
                  <span className="font-semibold text-white">{e.action}</span> {e.entity_type} #{e.entity_id} {e.actor_name ? `by ${e.actor_name}` : ''}
                </span>
                <span className="text-slate-500">{new Date(e.created_at).toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const DISPLAY_STATUS_BADGE = {
  APPROVED: 'bg-emerald-500/15 text-emerald-300',
  COMPLETED: 'bg-sky-500/15 text-sky-300',
  CANCELLED: 'bg-white/10 text-slate-400',
}

function HistoryTab() {
  const h = useBookingHistory()
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        <label className="block flex-1 min-w-40">
          <span className="mb-1 block text-xs font-semibold text-slate-400">Search</span>
          <input value={h.filters.q} onChange={(e) => h.changeFilters({ q: e.target.value })} placeholder="Name or purpose…" className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-400">Status</span>
          <select value={h.filters.status} onChange={(e) => h.changeFilters({ status: e.target.value })} className="rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white">
            <option value="">All</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-400">From</span>
          <input type="date" value={h.filters.from} onChange={(e) => h.changeFilters({ from: e.target.value })} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-400">To</span>
          <input type="date" value={h.filters.to} onChange={(e) => h.changeFilters({ to: e.target.value })} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
        </label>
      </div>

      <div className="mt-4">
        {h.loading && <p className="text-sm text-slate-400">Loading…</p>}
        {h.error && <p className="text-sm text-rose-300">{h.error}</p>}
        {!h.loading && !h.error && h.result && (
          <>
            {h.result.items.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-8 text-center text-sm text-slate-300">No bookings match these filters.</p>
            ) : (
              <div className="space-y-2">
                {h.result.items.map((b) => (
                  <div key={b.publicBookingId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {b.bookingType === 'STAFF_BLOCK' ? `Block — ${(b.blockType && GROUND_BLOCK_TYPES[b.blockType]) || b.purpose || 'Ground Block'}` : b.customerName}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatBookingDate(b.startTime)} · {formatSlotTime(b.startTime, b.endTime)}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${DISPLAY_STATUS_BADGE[b.displayStatus] || 'bg-white/10 text-slate-300'}`}>{b.displayStatus}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
              <span>
                {h.result.pagination.total === 0 ? 0 : h.offset + 1}–{Math.min(h.offset + h.pageSize, h.result.pagination.total)} of {h.result.pagination.total}
              </span>
              <div className="flex gap-2">
                <button type="button" disabled={h.offset === 0} onClick={() => h.setOffset(Math.max(0, h.offset - h.pageSize))} className="rounded-lg border border-white/15 px-3 py-1.5 font-semibold text-slate-200 disabled:opacity-40">
                  Previous
                </button>
                <button
                  type="button"
                  disabled={h.offset + h.pageSize >= h.result.pagination.total}
                  onClick={() => h.setOffset(h.offset + h.pageSize)}
                  className="rounded-lg border border-white/15 px-3 py-1.5 font-semibold text-slate-200 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ReportsTab() {
  const r = useGroundReports()
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-400">From</span>
          <input type="date" value={r.range.from} onChange={(e) => r.setRange((prev) => ({ ...prev, from: e.target.value }))} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-400">To</span>
          <input type="date" value={r.range.to} onChange={(e) => r.setRange((prev) => ({ ...prev, to: e.target.value }))} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
        </label>
      </div>

      {r.loading && <p className="mt-4 text-sm text-slate-400">Loading…</p>}
      {r.error && <p className="mt-4 text-sm text-rose-300">{r.error}</p>}

      {!r.loading && !r.error && r.report && r.utilization && (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Total Bookings" value={r.report.totalBookings} />
            <StatTile label="Completed" value={r.report.completed} />
            <StatTile label="Cancelled" value={r.report.cancelled} />
            <StatTile label="Utilization" value={r.utilization.utilizedPercentage != null ? `${r.utilization.utilizedPercentage.toFixed(1)}%` : '—'} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-sm font-bold text-white">Busiest Days</h3>
              {r.report.busyDays.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">No bookings in this range.</p>
              ) : (
                <ol className="mt-3 flex flex-col gap-2">
                  {r.report.busyDays.map((d) => (
                    <li key={d.date_str} className="flex items-center justify-between text-sm text-slate-200">
                      <span>{d.date_str}</span>
                      <span className="font-bold text-emerald-300">{d.count} booking{d.count === 1 ? '' : 's'}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-sm font-bold text-white">Peak Hours</h3>
              {r.report.peakHours.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">No bookings in this range.</p>
              ) : (
                <ol className="mt-3 flex flex-col gap-2">
                  {r.report.peakHours.map((h2) => (
                    <li key={h2.hour} className="flex items-center justify-between text-sm text-slate-200">
                      <span>{h2.hour}:00</span>
                      <span className="font-bold text-emerald-300">{h2.count} booking{h2.count === 1 ? '' : 's'}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-sm font-bold text-white">Ground Utilization Breakdown</h3>
            <p className="mt-1 text-xs text-slate-400">
              (booked + blocked + match hours) / total open hours × 100 — {r.utilization.totalHours}h total in this range
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Booked" value={r.utilization.bookedPercentage != null ? `${r.utilization.bookedPercentage.toFixed(1)}%` : '—'} />
              <StatTile label="Blocked/Maintenance" value={r.utilization.blockedPercentage != null ? `${r.utilization.blockedPercentage.toFixed(1)}%` : '—'} />
              <StatTile label="Match" value={r.utilization.matchPercentage != null ? `${r.utilization.matchPercentage.toFixed(1)}%` : '—'} />
              <StatTile label="Free" value={`${r.utilization.freeHours.toFixed(1)}h`} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function StaffBookingPage() {
  const s = useStaffBookingSchedule()
  const [tab, setTab] = useState('Schedule')

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat px-4 py-10 text-white sm:px-6 lg:px-8"
      style={{ backgroundImage: `linear-gradient(rgba(2,6,23,0.85), rgba(2,6,23,0.85)), url('/images/cricket-stadium.jpg')` }}
    >
      <div className="mx-auto max-w-4xl">
        <BackButton fallback="/" />

        <h1 className="mt-6 text-3xl font-bold text-white">Ground Operations</h1>

        <div className="mt-6 flex gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/5 p-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                tab === t ? 'bg-emerald-500 text-emerald-950' : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'Schedule' && <ScheduleTab s={s} />}
        {tab === 'Timeline' && <TimelineTab />}
        {tab === 'Dashboard' && <DashboardTab />}
        {tab === 'History' && <HistoryTab />}
        {tab === 'Reports' && <ReportsTab />}
      </div>
    </main>
  )
}
