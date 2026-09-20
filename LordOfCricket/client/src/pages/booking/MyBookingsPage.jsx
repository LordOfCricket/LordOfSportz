import { Link, useNavigate } from 'react-router-dom'
import { CalendarDays, Clock, MapPin } from 'lucide-react'
import { useMyBookings } from '../../hooks/useMyBookings.js'
import { formatBookingDate, formatSlotTime } from '../../models/booking.model.js'
import Button from '../../components/ui/Button.jsx'
import BackButton from '../../components/common/BackButton.jsx'

// Keyed by the server's derived displayStatus (APPROVED / COMPLETED /
// CANCELLED) — the same lifecycle label mobile's booking cards already show,
// so the two platforms read identically.
const STATUS_BADGE = {
  APPROVED: 'bg-emerald-500/15 text-emerald-300',
  COMPLETED: 'bg-white/10 text-slate-300',
  CANCELLED: 'bg-white/10 text-slate-400',
}

function isCancellable(booking) {
  return booking.status === 'CONFIRMED' && new Date(booking.startTime).getTime() > Date.now()
}

function BookingCard({ booking, onCancel, cancelling }) {
  const canCancel = isCancellable(booking)
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          {booking.ground && (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
              <MapPin className="h-4 w-4 text-emerald-300" />
              <Link to={`/grounds/${booking.ground.publicGroundId}`} className="hover:text-emerald-300">
                {booking.ground.name}
              </Link>
              {booking.ground.city && <span className="font-normal text-slate-400">· {booking.ground.city}</span>}
            </p>
          )}
          <p className={`flex items-center gap-1.5 text-sm ${booking.ground ? 'mt-1 text-slate-300' : 'font-semibold text-white'}`}>
            <CalendarDays className="h-4 w-4 text-emerald-300" />
            {formatBookingDate(booking.startTime)}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-300">
            <Clock className="h-4 w-4 text-slate-400" />
            {formatSlotTime(booking.startTime, booking.endTime)}
          </p>
          {booking.purpose && <p className="mt-1 text-xs text-slate-400">{booking.purpose}</p>}
          <p className="mt-2 text-xs font-semibold text-emerald-300">{booking.publicBookingId}</p>
          {booking.amount != null && <p className="mt-1 text-sm font-bold text-[#F5D547]">₹{Number(booking.amount).toLocaleString('en-IN')}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase ${STATUS_BADGE[booking.displayStatus] || 'bg-white/10 text-slate-300'}`}>
          {booking.displayStatus || booking.status}
        </span>
      </div>
      {canCancel && (
        <button
          type="button"
          disabled={cancelling}
          onClick={() => onCancel(booking.publicBookingId)}
          className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
        >
          {cancelling ? 'Cancelling…' : 'Cancel Booking'}
        </button>
      )}
    </div>
  )
}

export default function MyBookingsPage() {
  const navigate = useNavigate()
  const { loading, error, upcoming, history, cancel, cancellingId } = useMyBookings()

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat px-4 py-10 text-white sm:px-6 lg:px-8"
      style={{ backgroundImage: `linear-gradient(rgba(2,6,23,0.85), rgba(2,6,23,0.85)), url('/images/cricket-stadium.jpg')` }}
    >
      <div className="mx-auto max-w-3xl">
        <BackButton fallback="/" />

        <h1 className="mt-6 text-3xl font-bold text-white">My Bookings</h1>

        {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Loading…</p>
        ) : (
          <>
            <section className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Upcoming</h2>
              {upcoming.length === 0 ? (
                <p className="mt-3 rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-8 text-center text-sm text-slate-300">No upcoming bookings.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {upcoming.map((b) => (
                    <BookingCard key={b.publicBookingId} booking={b} onCancel={cancel} cancelling={cancellingId === b.publicBookingId} />
                  ))}
                </div>
              )}
            </section>

            <section className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">History</h2>
              {history.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">No past bookings yet.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {history.map((b) => (
                    <BookingCard key={b.publicBookingId} booking={b} onCancel={cancel} cancelling={cancellingId === b.publicBookingId} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        <Button onClick={() => navigate('/')} className="mt-8 h-11 bg-white/10 px-5 text-sm text-white">
          Book Another Slot
        </Button>
      </div>
    </main>
  )
}
