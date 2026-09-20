import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchGroundProfile } from '../../services/groundsApi.js'
import { fetchGroundBookings } from '../../services/groundOwnerApi.js'
import GroundNavTabs from '../../components/ground-owner/GroundNavTabs.jsx'

export default function GroundBookingPage() {
  const { publicGroundId } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [ground, setGround] = useState(null)
  const [upcomingCount, setUpcomingCount] = useState(0)
  const [todayCount, setTodayCount] = useState(0)

  const loadData = useCallback(() => {
    return Promise.resolve()
      .then(() => {
        setLoading(true)
        setError(null)
        return Promise.all([
          fetchGroundProfile(publicGroundId),
          fetchGroundBookings(publicGroundId, { status: 'CONFIRMED' }),
        ])
      })
      .then(([groundData, bookings]) => {
        setGround(groundData)

        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

        const todayBookings = bookings.filter(b => {
          const bookingDate = new Date(b.startTime)
          const bookingDay = new Date(bookingDate.getFullYear(), bookingDate.getMonth(), bookingDate.getDate())
          return bookingDay.getTime() === today.getTime()
        })

        const upcoming = bookings.filter(b => new Date(b.startTime).getTime() > now.getTime())

        setTodayCount(todayBookings.length)
        setUpcomingCount(upcoming.length)
      })
      .catch((err) => setError(err.response?.data?.message || err.response?.data?.error || 'Failed to load booking data'))
      .finally(() => setLoading(false))
  }, [publicGroundId])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-slate-700 rounded w-1/3"></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="h-24 bg-slate-700 rounded"></div>
              <div className="h-24 bg-slate-700 rounded"></div>
              <div className="h-24 bg-slate-700 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Booking Management</h1>
        <p className="text-slate-400 mb-6">Manage your ground's bookings and availability</p>

        <div className="lg:flex lg:items-start lg:gap-6">
        <GroundNavTabs />

        <div className="min-w-0 flex-1">

        {error && (
          <div className="mt-6 p-4 bg-red-900/30 border border-red-500/50 rounded text-red-200">
            {error}
          </div>
        )}

        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-6">{ground?.name}</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Today's Bookings */}
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <div className="text-slate-400 text-sm font-medium mb-2">Today's Bookings</div>
              <div className="text-4xl font-bold text-amber-400 mb-4">{todayCount}</div>
              <button
                onClick={() => navigate(`/ground-owner/grounds/${publicGroundId}/bookings/list?date=${new Date().toISOString().split('T')[0]}`)}
                className="w-full px-4 py-2 bg-amber-600 text-white rounded font-medium hover:bg-amber-500 transition"
              >
                View Today
              </button>
            </div>

            {/* Upcoming Bookings */}
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <div className="text-slate-400 text-sm font-medium mb-2">Upcoming (7 days)</div>
              <div className="text-4xl font-bold text-blue-400 mb-4">{upcomingCount}</div>
              <button
                onClick={() => navigate(`/ground-owner/grounds/${publicGroundId}/bookings/list`)}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-500 transition"
              >
                View All
              </button>
            </div>

            {/* Availability Calendar */}
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <div className="text-slate-400 text-sm font-medium mb-2">Availability</div>
              <div className="text-3xl font-bold text-green-400 mb-4">View</div>
              <button
                onClick={() => navigate(`/ground-owner/grounds/${publicGroundId}/bookings/calendar`)}
                className="w-full px-4 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-500 transition"
              >
                Calendar
              </button>
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
            <div className="space-y-2 text-slate-300 text-sm">
              <p>✓ View ground availability calendar</p>
              <p>✓ Manage all bookings and customer details</p>
              <p>✓ Create and remove staff blocks</p>
              <p>✓ Check in customers and mark no-shows</p>
              <p>✓ Track booking history and status</p>
            </div>
          </div>
        </div>
        </div>
        </div>
      </div>
    </div>
  )
}
