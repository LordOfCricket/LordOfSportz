import { useState, useEffect, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { fetchGroundBookings } from '../../services/groundOwnerApi.js'
import GroundNavTabs from '../../components/ground-owner/GroundNavTabs.jsx'

const STATUS_BADGE = {
  CONFIRMED: 'bg-emerald-500/15 text-emerald-300',
  CANCELLED: 'bg-white/10 text-slate-400',
}

const BOOKING_TYPE_LABEL = {
  CUSTOMER: 'Walk-in',
  STAFF_BLOCK: 'Staff Block',
  TEAM: 'Team Booking',
}

export default function GroundBookingListPage() {
  const { publicGroundId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [bookings, setBookings] = useState([])
  const [statusFilter, setStatusFilter] = useState('CONFIRMED')

  const loadData = useCallback(() => {
    return Promise.resolve()
      .then(() => {
        setLoading(true)
        setError(null)
        return fetchGroundBookings(publicGroundId)
      })
      .then((allBookings) => setBookings(allBookings))
      .catch((err) => setError(err.response?.data?.message || err.response?.data?.error || 'Failed to load bookings'))
      .finally(() => setLoading(false))
  }, [publicGroundId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // "View Today" (GroundBookingPage.jsx) links here with ?date=YYYY-MM-DD —
  // this page previously never read it, so the link silently showed every
  // CONFIRMED booking instead of just today's.
  const dateParam = searchParams.get('date')

  const filteredBookings = bookings
    .filter(b => statusFilter === 'ALL' || b.status === statusFilter)
    .filter(b => {
      if (!dateParam) return true
      const d = new Date(b.startTime)
      const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return localDateStr === dateParam
    })
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())

  const formatDateTime = (dateTimeStr) => {
    const date = new Date(dateTimeStr)
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }

  const formatDate = (dateTimeStr) => {
    const date = new Date(dateTimeStr)
    return date.toLocaleDateString()
  }

  const formatTime = (dateTimeStr) => {
    const date = new Date(dateTimeStr)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-slate-700 rounded w-1/3"></div>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-20 bg-slate-700 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">All Bookings</h1>
        <p className="text-slate-400 mb-6">Manage your ground's bookings</p>

        <div className="lg:flex lg:items-start lg:gap-6">
        <GroundNavTabs />

        <div className="min-w-0 flex-1">

        {error && (
          <div className="mt-6 p-4 bg-red-900/30 border border-red-500/50 rounded text-red-200">
            {error}
          </div>
        )}

        {dateParam && (
          <div className="mt-6 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-900/20 px-4 py-2 text-sm text-amber-200">
            <span>Showing bookings for {dateParam}</span>
            <button onClick={() => setSearchParams({})} className="underline hover:text-amber-100">
              Clear filter
            </button>
          </div>
        )}

        <div className="mt-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Bookings ({filteredBookings.length})</h2>

            <div className="flex gap-2">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-4 py-2 rounded font-medium transition ${
                  statusFilter === 'ALL'
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter('CONFIRMED')}
                className={`px-4 py-2 rounded font-medium transition ${
                  statusFilter === 'CONFIRMED'
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Confirmed
              </button>
              <button
                onClick={() => setStatusFilter('CANCELLED')}
                className={`px-4 py-2 rounded font-medium transition ${
                  statusFilter === 'CANCELLED'
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Cancelled
              </button>
            </div>
          </div>

          {filteredBookings.length === 0 ? (
            <div className="p-6 bg-slate-800 rounded-lg border border-slate-700 text-center">
              <p className="text-slate-400">No bookings found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredBookings.map((booking) => (
                <div
                  key={booking.publicBookingId}
                  className="bg-slate-800 rounded-lg p-6 border border-slate-700 hover:border-slate-600 transition"
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold">{booking.customerName}</h3>
                      <p className="text-sm text-slate-300 mt-1">
                        {formatDate(booking.startTime)} • {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                      </p>
                      <p className="text-xs text-slate-400 mt-2">Ref: {booking.publicBookingId}</p>
                    </div>

                    <div className="text-right">
                      <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold uppercase ${STATUS_BADGE[booking.status] || 'bg-white/10 text-slate-300'}`}>
                        {booking.status}
                      </span>
                      <p className="text-xs text-slate-400 mt-2">{BOOKING_TYPE_LABEL[booking.bookingType] || booking.bookingType}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm mb-4 pb-4 border-b border-slate-700">
                    {booking.expectedPlayers && (
                      <div>
                        <p className="text-slate-400">Expected Players</p>
                        <p className="text-white font-medium">{booking.expectedPlayers}</p>
                      </div>
                    )}
                    {booking.contactPhone && (
                      <div>
                        <p className="text-slate-400">Phone</p>
                        <p className="text-white font-medium">{booking.contactPhone}</p>
                      </div>
                    )}
                    {booking.contactEmail && (
                      <div>
                        <p className="text-slate-400">Email</p>
                        <p className="text-white font-medium text-xs break-all">{booking.contactEmail}</p>
                      </div>
                    )}
                  </div>

                  {booking.purpose && (
                    <div className="text-sm text-slate-300 mb-4">
                      <p className="text-slate-400">Purpose</p>
                      <p>{booking.purpose}</p>
                    </div>
                  )}

                  {booking.notes && (
                    <div className="text-sm text-slate-300 mb-4">
                      <p className="text-slate-400">Notes</p>
                      <p>{booking.notes}</p>
                    </div>
                  )}

                  {booking.checkedInAt && (
                    <div className="text-xs text-emerald-400">
                      ✓ Checked in at {formatDateTime(booking.checkedInAt)}
                    </div>
                  )}

                  {booking.noShowAt && (
                    <div className="text-xs text-rose-400">
                      ✗ Marked no-show at {formatDateTime(booking.noShowAt)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
        </div>
      </div>
    </div>
  )
}
