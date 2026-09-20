import { useState, useEffect, useCallback } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import {
  fetchGroundPricingSlots,
  createGroundPricingSlot,
  updateGroundPricingSlot,
  deleteGroundPricingSlot,
} from '../../services/groundOwnerApi.js'
import { useMyGroundStaffMemberships } from '../../hooks/useMyGroundStaffMemberships.js'
import { hasStaffPermission } from '../../models/groundStaffNav.model.js'
import GroundNavTabs from '../../components/ground-owner/GroundNavTabs.jsx'

// Ground Time-Slot Pricing — owner-facing CRUD, mirrors GroundCanteenMenuPage's
// inline list+form shape (no modal/design-system dependency this codebase
// doesn't have). PRICING_VIEW-only staff (no PRICING_MANAGE) see the list but
// not the write actions, same pattern GroundMatchesPage uses for MATCH_VIEW.
function formatTime(t) {
  return t ? t.slice(0, 5) : t
}

export default function GroundPricingPage() {
  const { publicGroundId } = useParams()

  const isStaffContext = useLocation().pathname.startsWith('/staff/')
  const { memberships } = useMyGroundStaffMemberships(isStaffContext)
  const membership = isStaffContext ? memberships.find((m) => m.publicGroundId === publicGroundId) : null
  const canManage = !isStaffContext || hasStaffPermission(membership, 'PRICING_MANAGE')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const [slots, setSlots] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({ startTime: '', endTime: '', price: '' })

  const loadData = useCallback(() => {
    return Promise.resolve()
      .then(() => {
        setLoading(true)
        setError(null)
        return fetchGroundPricingSlots(publicGroundId)
      })
      .then((data) => setSlots(data))
      .catch((err) => setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load pricing slots'))
      .finally(() => setLoading(false))
  }, [publicGroundId])

  useEffect(() => {
    loadData()
  }, [loadData])

  function resetForm() {
    setFormData({ startTime: '', endTime: '', price: '' })
    setEditingId(null)
  }

  function handleEdit(slot) {
    setFormData({ startTime: formatTime(slot.start_time), endTime: formatTime(slot.end_time), price: slot.price })
    setEditingId(slot.id)
    setShowForm(true)
  }

  async function handleSave() {
    if (!formData.startTime || !formData.endTime || formData.price === '') {
      setError('Start time, end time, and price are all required.')
      return
    }
    if (formData.startTime >= formData.endTime) {
      setError('Start time must be before end time.')
      return
    }
    if (Number(formData.price) < 0) {
      setError('Price cannot be negative.')
      return
    }

    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      const payload = { startTime: formData.startTime, endTime: formData.endTime, price: Number(formData.price) }
      if (editingId) {
        await updateGroundPricingSlot(publicGroundId, editingId, payload)
        setSuccess('Pricing slot updated successfully.')
      } else {
        await createGroundPricingSlot(publicGroundId, payload)
        setSuccess('Pricing slot created successfully.')
      }

      await loadData()
      resetForm()
      setShowForm(false)
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to save pricing slot')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(slot) {
    try {
      setSaving(true)
      setError(null)
      setSuccess(null)
      await updateGroundPricingSlot(publicGroundId, slot.id, { isActive: !slot.is_active })
      setSuccess(slot.is_active ? 'Pricing slot deactivated.' : 'Pricing slot activated.')
      await loadData()
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to update pricing slot')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(slot) {
    if (!confirm('Are you sure you want to delete this pricing slot?')) return

    try {
      setSaving(true)
      setError(null)
      setSuccess(null)
      await deleteGroundPricingSlot(publicGroundId, slot.id)
      setSuccess('Pricing slot deleted successfully.')
      await loadData()
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to delete pricing slot')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-slate-700 rounded w-1/3"></div>
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
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
        <h1 className="text-3xl font-bold mb-2">Pricing</h1>
        <p className="text-slate-400 mb-6">Set time-of-day price bands customers see when booking this ground</p>

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

        {canManage && (
          <div className="mt-6 flex justify-between items-center">
            <h2 className="text-xl font-semibold">Pricing Slots ({slots.length})</h2>
            {!showForm && (
              <button
                onClick={() => { resetForm(); setShowForm(true) }}
                className="px-4 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-500 transition"
              >
                + Add Pricing Slot
              </button>
            )}
          </div>
        )}

        {canManage && showForm && (
          <div className="mt-6 bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold mb-4">
              {editingId ? 'Edit Pricing Slot' : 'Create Pricing Slot'}
            </h3>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Start Time *</label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:border-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">End Time *</label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:border-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Price (₹) *</label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {saving ? 'Saving...' : 'Save Slot'}
              </button>
              <button
                onClick={() => { resetForm(); setShowForm(false) }}
                disabled={saving}
                className="px-6 py-2 bg-slate-700 text-white rounded font-medium hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="mt-8 space-y-4">
          {slots.length === 0 ? (
            <div className="p-6 bg-slate-800 rounded-lg border border-slate-700 text-center">
              <p className="text-slate-400">No pricing slots yet{canManage ? ' — create your first one!' : '.'}</p>
            </div>
          ) : (
            slots.map((slot) => (
              <div key={slot.id} className="bg-slate-800 rounded-lg p-4 border border-slate-700 flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">
                    {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                  </h3>
                  <div className="mt-2 flex gap-6 text-sm items-center">
                    <span>₹{Number(slot.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    <span className={slot.is_active ? 'text-green-400' : 'text-slate-500'}>
                      {slot.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                {canManage && (
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleEdit(slot)}
                      disabled={saving}
                      className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-500 disabled:opacity-50 transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleActive(slot)}
                      disabled={saving}
                      className="px-4 py-2 bg-amber-600 text-white rounded text-sm hover:bg-amber-500 disabled:opacity-50 transition"
                    >
                      {slot.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleDelete(slot)}
                      disabled={saving}
                      className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-500 disabled:opacity-50 transition"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        </div>
        </div>
      </div>
    </div>
  )
}
