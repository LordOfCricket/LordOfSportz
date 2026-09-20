import { useState, useEffect, useCallback } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { fetchGroundAvailability, fetchGroundBookings, createGroundStaffBlock } from '../../services/groundOwnerApi.js'
import GroundNavTabs from '../../components/ground-owner/GroundNavTabs.jsx'

export default function GroundBookingCalendarPage() {
  const { publicGroundId } = useParams()
  // Staff Dashboard reuse — staff-block creation is hardcoded Owner-only
  // server-side (groundOwnerBooking.routes.js, never delegable via any
  // permission grant), so the button is hidden rather than shown-then-403'd
  // for a staff viewer. Same /staff/ prefix detection GroundNavTabs uses.
  const isStaffContext = useLocation().pathname.startsWith('/staff/')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [slots, setSlots] = useState([])
  const [bookings, setBookings] = useState([])
  const [showBlockForm, setShowBlockForm] = useState(false)
  const [blockFormData, setBlockFormData] = useState({ hour: '09', minute: '00', purpose: '', blockType: 'CLOSED' })

  const loadData = useCallback(() => {
    return Promise.resolve()
      .then(() => {
        setLoading(true)
        setError(null)
        return Promise.all([
          fetchGroundAvailability(publicGroundId, selectedDate),
          fetchGroundBookings(publicGroundId),
        ])
      })
      .then(([availabilitySlots, allBookings]) => {
        setSlots(availabilitySlots)
        const dayBookings = allBookings.filter(b => b.startTime.split('T')[0] === selectedDate)
        setBookings(dayBookings)
      })
      .catch((err) => setError(err.response?.data?.message || err.response?.data?.error || 'Failed to load calendar data'))
      .finally(() => setLoading(false))
  }, [publicGroundId, selectedDate])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handleCreateBlock() {
    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      await createGroundStaffBlock(publicGroundId, {
        date: selectedDate,
        hour: Number(blockFormData.hour),
        minute: Number(blockFormData.minute),
        purpose: blockFormData.purpose || 'Ground Block',
        blockType: blockFormData.blockType,
      })

      setSuccess('Staff block created successfully.')
      setShowBlockForm(false)
      setBlockFormData({ hour: '09', minute: '00', purpose: '', blockType: 'CLOSED' })
      await loadData()
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to create staff block')
    } finally {
      setSaving(false)
    }
  }

  const formatTime = (timeStr) => {
    if (!timeStr) return ''
    const [, time] = timeStr.split('T')
    if (!time) return ''
    const [hours, minutes] = time.split(':')
    return `${hours}:${minutes}`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-slate-700 rounded w-1/3"></div>
            <div className="h-96 bg-slate-700 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Booking Calendar</h1>
        <p className="text-slate-400 mb-6">View availability and manage staff blocks</p>

        <div className="lg:flex lg:items-start lg:gap-6">
        <GroundNavTabs />

        <div className="min-w-0 flex-1">

        {error && (
          <div className="mt-6 p-4 bg-red-900/30 border border-red-500/50 rounded text-red-200">
            {error}
          </div>
        )}

        {success && (
          <div className="mt-6 p-4 bg-green-900/30 border border-green-500/50 rounded text-green-200">
            {success}
          </div>
        )}

        <div className="mt-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Select Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:border-green-500"
              />
            </div>
            {!showBlockForm && !isStaffContext && (
              <button
                onClick={() => setShowBlockForm(true)}
                className="px-4 py-2 bg-amber-600 text-white rounded font-medium hover:bg-amber-500 transition"
              >
                + Block Time
              </button>
            )}
          </div>

          {showBlockForm && !isStaffContext && (
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 mb-6">
              <h3 className="text-lg font-semibold mb-4">Create Staff Block</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Hour (0-23)</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={blockFormData.hour}
                    onChange={(e) => setBlockFormData({ ...blockFormData, hour: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Minute (0-59)</label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={blockFormData.minute}
                    onChange={(e) => setBlockFormData({ ...blockFormData, minute: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:border-green-500"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-1">Purpose</label>
                <input
                  type="text"
                  value={blockFormData.purpose}
                  onChange={(e) => setBlockFormData({ ...blockFormData, purpose: e.target.value })}
                  placeholder="e.g., Maintenance, Event"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:border-green-500"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-1">Block Type</label>
                <select
                  value={blockFormData.blockType}
                  onChange={(e) => setBlockFormData({ ...blockFormData, blockType: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:border-green-500"
                >
                  <option value="CLOSED">Ground Closed</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="PRIVATE_EVENT">Private Event</option>
                  <option value="CLEANING">Cleaning</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleCreateBlock}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-500 disabled:opacity-50 transition"
                >
                  {saving ? 'Creating...' : 'Create Block'}
                </button>
                <button
                  onClick={() => setShowBlockForm(false)}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-slate-700 text-white rounded font-medium hover:bg-slate-600 disabled:opacity-50 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Available Slots */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 mb-6">
            <h3 className="text-lg font-semibold mb-4">Available Slots</h3>
            {slots.length === 0 ? (
              <p className="text-slate-400">No available slots for this date.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {slots.map((slot, idx) => (
                  <div key={idx} className="bg-slate-700 rounded p-3 text-sm">
                    <p className="font-semibold text-green-400">{formatTime(slot.startTime)} - {formatTime(slot.endTime)}</p>
                    <p className="text-xs text-slate-400 mt-1">{slot.status}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bookings for this date */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold mb-4">Bookings ({bookings.length})</h3>
            {bookings.length === 0 ? (
              <p className="text-slate-400">No bookings for this date.</p>
            ) : (
              <div className="space-y-3">
                {bookings.map((booking) => (
                  <div key={booking.publicBookingId} className="bg-slate-700 rounded p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{booking.customerName}</p>
                        <p className="text-sm text-slate-300">
                          {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">Ref: {booking.publicBookingId}</p>
                      </div>
                      <span className={`px-3 py-1 rounded text-xs font-semibold ${booking.status === 'CONFIRMED' ? 'bg-green-500/20 text-green-300' : 'bg-slate-600 text-slate-300'}`}>
                        {booking.status}
                      </span>
                    </div>
                    {booking.purpose && <p className="text-xs text-slate-400 mt-2">{booking.purpose}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        </div>
        </div>
      </div>
    </div>
  )
}
