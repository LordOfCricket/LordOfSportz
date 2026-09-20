import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import GroundOwnerLayout from '../../components/ground-owner/GroundOwnerLayout.jsx'
import GroundNavTabs from '../../components/ground-owner/GroundNavTabs.jsx'
import { updateGroundProfile } from '../../services/groundOwnerApi.js'
import { fetchGroundProfile } from '../../services/groundsApi.js'

// Phase 23 — the schema/domain layer has always supported an optional,
// per-ground override of operating hours (opening_hour/closing_hour,
// domain/booking/teamBookingValidation.js#resolveGroundHours falls back to
// the platform default independently per field), but no Ground Owner UI
// ever exposed it. '' means "not set" (uses the platform default), never 0.
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => h)

function formatHour(hour) {
  const h = hour % 24
  const period = h < 12 ? 'AM' : 'PM'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display}:00 ${period}`
}

function GroundProfileForm({ ground, onSave, saving, error }) {
  const [formData, setFormData] = useState({
    name: ground?.name || '',
    description: ground?.description || '',
    phone: ground?.phone || '',
    email: ground?.email || '',
    website: ground?.website || '',
    openingHour: ground?.openingHour ?? '',
    closingHour: ground?.closingHour ?? '',
  })
  const [validationErrors, setValidationErrors] = useState({})
  const [hasChanges, setHasChanges] = useState(false)

  const validateForm = () => {
    const errors = {}
    if (!formData.name || !formData.name.trim()) errors.name = 'Ground name is required.'
    if (formData.name && formData.name.length > 150) errors.name = 'Ground name must be 150 characters or fewer.'
    if (formData.description && formData.description.length > 500) errors.description = 'Description must be 500 characters or fewer.'
    if (formData.phone && !/^[+\d\s\-()]+$/.test(formData.phone)) errors.phone = 'Please enter a valid phone number.'
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = 'Please enter a valid email address.'
    if (formData.website && formData.website.trim() && !/^https?:\/\/.+\..+/.test(formData.website)) {
      errors.website = 'Website must be a valid URL (starting with http:// or https://).'
    }
    if (formData.openingHour !== '' && formData.closingHour !== '' && Number(formData.closingHour) <= Number(formData.openingHour)) {
      errors.closingHour = 'Closing time must be later than opening time.'
    }
    return errors
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setHasChanges(true)
    // Clear error for this field when user starts editing
    if (validationErrors[name]) {
      setValidationErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errors = validateForm()
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }

    setValidationErrors({})
    const ok = await onSave(formData)
    if (ok) {
      setHasChanges(false)
    }
  }

  const handleCancel = () => {
    setFormData({
      name: ground?.name || '',
      description: ground?.description || '',
      phone: ground?.phone || '',
      email: ground?.email || '',
      website: ground?.website || '',
      openingHour: ground?.openingHour ?? '',
      closingHour: ground?.closingHour ?? '',
    })
    setHasChanges(false)
    setValidationErrors({})
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* BASIC INFORMATION SECTION */}
      <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
        <h3 className="mb-4 text-lg font-semibold text-white">Basic Information</h3>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-200">Ground Name</span>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., SS Cricket Ground"
              className={`w-full rounded-xl border px-4 py-3 text-sm text-white transition ${
                validationErrors.name
                  ? 'border-red-400/50 bg-red-500/5'
                  : 'border-white/15 bg-white/5'
              }`}
            />
            {validationErrors.name && (
              <p className="mt-1 text-xs text-red-300">{validationErrors.name}</p>
            )}
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-200">About the Ground</span>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Describe your ground, its facilities, and what makes it special..."
              rows={4}
              className={`w-full rounded-xl border px-4 py-3 text-sm text-white transition ${
                validationErrors.description
                  ? 'border-red-400/50 bg-red-500/5'
                  : 'border-white/15 bg-white/5'
              }`}
            />
            <p className="mt-1 text-xs text-slate-400">
              {formData.description.length}/500 characters
            </p>
            {validationErrors.description && (
              <p className="mt-1 text-xs text-red-300">{validationErrors.description}</p>
            )}
          </label>
        </div>
      </div>

      {/* CONTACT INFORMATION SECTION */}
      <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
        <h3 className="mb-4 text-lg font-semibold text-white">Contact Information</h3>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-200">Contact Number</span>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+91 XXXXX XXXXX"
              className={`w-full rounded-xl border px-4 py-3 text-sm text-white transition ${
                validationErrors.phone
                  ? 'border-red-400/50 bg-red-500/5'
                  : 'border-white/15 bg-white/5'
              }`}
            />
            {validationErrors.phone && (
              <p className="mt-1 text-xs text-red-300">{validationErrors.phone}</p>
            )}
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-200">Email</span>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="ground@example.com"
              className={`w-full rounded-xl border px-4 py-3 text-sm text-white transition ${
                validationErrors.email
                  ? 'border-red-400/50 bg-red-500/5'
                  : 'border-white/15 bg-white/5'
              }`}
            />
            {validationErrors.email && (
              <p className="mt-1 text-xs text-red-300">{validationErrors.email}</p>
            )}
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-200">Website</span>
            <input
              type="url"
              name="website"
              value={formData.website}
              onChange={handleChange}
              placeholder="https://example.com"
              className={`w-full rounded-xl border px-4 py-3 text-sm text-white transition ${
                validationErrors.website
                  ? 'border-red-400/50 bg-red-500/5'
                  : 'border-white/15 bg-white/5'
              }`}
            />
            {validationErrors.website && (
              <p className="mt-1 text-xs text-red-300">{validationErrors.website}</p>
            )}
          </label>
        </div>
      </div>

      {/* OPERATING HOURS SECTION */}
      <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
        <h3 className="mb-1 text-lg font-semibold text-white">Operating Hours</h3>
        <p className="mb-4 text-xs text-slate-400">
          Leave either field blank to use the platform default (6:00 AM – 10:00 PM). Bookings are only
          accepted within these hours.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-200">Opening Time</span>
            <select
              name="openingHour"
              value={formData.openingHour}
              onChange={handleChange}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white transition"
            >
              <option value="">Platform default (6:00 AM)</option>
              {HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>{formatHour(h)}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-200">Closing Time</span>
            <select
              name="closingHour"
              value={formData.closingHour}
              onChange={handleChange}
              className={`w-full rounded-xl border px-4 py-3 text-sm text-white transition ${
                validationErrors.closingHour
                  ? 'border-red-400/50 bg-red-500/5'
                  : 'border-white/15 bg-white/5'
              }`}
            >
              <option value="">Platform default (10:00 PM)</option>
              {HOUR_OPTIONS.map((h) => (
                <option key={h + 1} value={h + 1}>{formatHour(h + 1)}</option>
              ))}
            </select>
            {validationErrors.closingHour && (
              <p className="mt-1 text-xs text-red-300">{validationErrors.closingHour}</p>
            )}
          </label>
        </div>
      </div>

      {/* ACTION BUTTONS */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleCancel}
          disabled={!hasChanges || saving}
          className="flex-1 rounded-2xl border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!hasChanges || saving}
          className="flex-1 rounded-2xl bg-linear-to-r from-green-700 via-green-500 to-lime-500 px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-green-900/40"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}

export default function GroundProfilePage() {
  const { publicGroundId } = useParams()
  const [ground, setGround] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    Promise.resolve()
      .then(() => {
        setLoading(true)
        setError(null)
        return fetchGroundProfile(publicGroundId)
      })
      .then(data => setGround(data.ground))
      .catch(err => setError(err.response?.data?.error || "Couldn't load ground profile."))
      .finally(() => setLoading(false))
  }, [publicGroundId])

  const handleSave = async (formData) => {
    setSaving(true)
    setSaveError(null)
    setSuccess(false)

    try {
      const updated = await updateGroundProfile(publicGroundId, {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        website: formData.website.trim() || null,
        openingHour: formData.openingHour === '' ? null : Number(formData.openingHour),
        closingHour: formData.closingHour === '' ? null : Number(formData.closingHour),
      })
      setGround(updated)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 5000)
      return true
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to save ground profile.')
      return false
    } finally {
      setSaving(false)
    }
  }

  return (
    <GroundOwnerLayout>
      <div className="lg:flex lg:items-start lg:gap-6">
        <GroundNavTabs />

        <div className="min-w-0 flex-1">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">Ground Profile</h1>
        <p className="mt-2 text-slate-400">Manage the information displayed on your public ground page.</p>
      </div>

      {success && (
        <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          Ground profile updated successfully.
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center rounded-[1.5rem] border border-white/10 bg-slate-900/50 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {!loading && ground && (
        <GroundProfileForm
          key={ground.id}
          ground={ground}
          onSave={handleSave}
          saving={saving}
          error={saveError}
        />
      )}
        </div>
      </div>
    </GroundOwnerLayout>
  )
}
