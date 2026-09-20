import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, Clock, Plus } from 'lucide-react'
import BackButton from '../../components/common/BackButton.jsx'
import { useAuth } from '../../hooks/useAuth.js'
import { useTeamBooking } from '../../hooks/useTeamBooking.js'
import { fetchMyTeamBookings } from '../../services/teamBookingApi.js'
import { formatBookingDate, formatSlotTime } from '../../models/booking.model.js'
import Button from '../../components/ui/Button.jsx'

const STATUS_COLORS = {
  HOLD: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
  PROPOSED: 'border-blue-400/30 bg-blue-500/10 text-blue-300',
  PENDING: 'border-yellow-400/30 bg-yellow-500/10 text-yellow-300',
  CONFIRMED: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
  REJECTED: 'border-rose-400/30 bg-rose-500/10 text-rose-300',
  CANCELLED: 'border-slate-400/30 bg-slate-500/10 text-slate-300',
  EXPIRED: 'border-slate-400/30 bg-slate-500/10 text-slate-300',
  COMPLETED: 'border-slate-400/30 bg-slate-500/10 text-slate-300',
  NO_SHOW: 'border-red-400/30 bg-red-500/10 text-red-300',
}

function isCancellable(booking) {
  return (booking.status === 'CONFIRMED' || booking.status === 'PENDING') && new Date(booking.start_time).getTime() > Date.now()
}

function BookingCard({ booking, onCancel, cancelling }) {
  const canCancel = isCancellable(booking)
  const colors = STATUS_COLORS[booking.status] || 'border-white/10 bg-white/5 text-slate-300'

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-300">
            {booking.ground_name || 'Ground'}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-white">
            <CalendarDays className="h-4 w-4 text-emerald-300" />
            {formatBookingDate(booking.start_time)}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-300">
            <Clock className="h-4 w-4 text-slate-400" />
            {formatSlotTime(booking.start_time, booking.end_time)}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            {booking.booking_purpose === 'MATCH' ? '🏏 Match' : '🏋️ Practice'}
          </p>
          <p className="mt-1 text-xs font-mono text-slate-500">{booking.public_booking_id}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${colors}`}>
          {booking.status}
        </span>
      </div>
      {canCancel && (
        <button
          type="button"
          disabled={cancelling}
          onClick={() => onCancel(booking.public_booking_id)}
          className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
        >
          {cancelling ? 'Cancelling…' : 'Cancel Booking'}
        </button>
      )}
    </div>
  )
}

export default function MyTeamBookingsPage() {
  const navigate = useNavigate()
  const { player } = useAuth()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cancelling, setCancelling] = useState(null)
  // Stable snapshot of "now" for the upcoming/history split — computed once
  // on mount (not on every render) so it stays a pure value during render.
  const [now] = useState(() => Date.now())

  const { cancel } = useTeamBooking(null)

  useEffect(() => {
    const loadBookings = async () => {
      if (!player?.team_id) {
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const myBookings = await fetchMyTeamBookings()
        setBookings(myBookings)
      } catch (err) {
        setError(err.response?.data?.message || err.response?.data?.error || 'Unable to load bookings.')
      } finally {
        setLoading(false)
      }
    }

    loadBookings()
  }, [player?.team_id])

  const handleCancel = async (bookingId) => {
    setCancelling(bookingId)
    const ok = await cancel(bookingId)
    if (ok) {
      setBookings((prev) => prev.filter((b) => b.public_booking_id !== bookingId))
    }
    setCancelling(null)
  }

  const upcoming = bookings.filter((b) => new Date(b.start_time).getTime() > now)
  const history = bookings.filter((b) => new Date(b.start_time).getTime() <= now)

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat px-4 py-10 text-white sm:px-6 lg:px-8"
      style={{ backgroundImage: `linear-gradient(rgba(2,6,23,0.85), rgba(2,6,23,0.85)), url('/images/cricket-stadium.jpg')` }}
    >
      <div className="mx-auto max-w-3xl">
        <BackButton fallback="/" />

        <h1 className="mt-6 text-3xl font-bold text-white">My Team Bookings</h1>

        {!player?.team_id && (
          <div className="mt-4 rounded-2xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
            You are not part of a team. Join a team to view and create bookings.
          </div>
        )}

        {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Loading…</p>
        ) : player?.team_id ? (
          <>
            <section className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Upcoming</h2>
              {upcoming.length === 0 ? (
                <p className="mt-3 rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-8 text-center text-sm text-slate-300">No upcoming bookings.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {upcoming.map((b) => (
                    <BookingCard
                      key={b.public_booking_id}
                      booking={b}
                      onCancel={handleCancel}
                      cancelling={cancelling === b.public_booking_id}
                    />
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
                    <BookingCard key={b.public_booking_id} booking={b} onCancel={handleCancel} cancelling={cancelling === b.public_booking_id} />
                  ))}
                </div>
              )}
            </section>

            <Button onClick={() => navigate('/team-booking/create')} className="mt-8 h-11 bg-emerald-600 px-5 text-sm text-white">
              <Plus className="h-4 w-4" /> Create New Booking
            </Button>
          </>
        ) : null}
      </div>
    </main>
  )
}
