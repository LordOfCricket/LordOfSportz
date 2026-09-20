import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { updateGroundProfile } from '../../services/groundOwnerApi.js'
import { fetchGroundProfile } from '../../services/groundsApi.js'
import LocationMapPicker from '../../components/ground-registration/LocationMapPicker.jsx'
import LocationMap from '../../components/ground/LocationMap.jsx'
import GroundNavTabs from '../../components/ground-owner/GroundNavTabs.jsx'

export default function GroundLocationPage() {
  const { publicGroundId } = useParams()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [isDirty, setIsDirty] = useState(false)

  const [ground, setGround] = useState(null)
  const [formData, setFormData] = useState({
    addressLine: '',
    city: '',
    state: '',
    postalCode: '',
    latitude: null,
    longitude: null,
  })

  const loadGround = useCallback(() => {
    return Promise.resolve()
      .then(() => {
        setLoading(true)
        setError(null)
        return fetchGroundProfile(publicGroundId)
      })
      .then((data) => {
        setGround(data)
        setFormData({
          addressLine: data.addressLine || '',
          city: data.city || '',
          state: data.state || '',
          postalCode: data.postalCode || '',
          latitude: data.latitude || null,
          longitude: data.longitude || null,
        })
        setIsDirty(false)
      })
      .catch((err) => setError(err.message || 'Failed to load ground profile'))
      .finally(() => setLoading(false))
  }, [publicGroundId])

  useEffect(() => {
    loadGround()
  }, [loadGround])

  function handleFieldChange(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }))
    setIsDirty(true)
    setSuccess(null)
  }

  function handleMapPick(lat, lng) {
    setFormData(prev => ({ ...prev, latitude: lat, longitude: lng }))
    setIsDirty(true)
  }

  async function handleSave() {
    if (!isDirty) return

    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      const updates = {}
      if (formData.addressLine !== (ground.addressLine || '')) {
        updates.addressLine = formData.addressLine || null
      }
      if (formData.city !== (ground.city || '')) {
        updates.city = formData.city || null
      }
      if (formData.state !== (ground.state || '')) {
        updates.state = formData.state || null
      }
      if (formData.postalCode !== (ground.postalCode || '')) {
        updates.postalCode = formData.postalCode || null
      }
      if (formData.latitude !== ground.latitude) {
        updates.latitude = formData.latitude
      }
      if (formData.longitude !== ground.longitude) {
        updates.longitude = formData.longitude
      }

      if (Object.keys(updates).length === 0) {
        setSuccess('No changes to save.')
        return
      }

      const updated = await updateGroundProfile(publicGroundId, updates)
      setGround(updated)
      setFormData({
        addressLine: updated.addressLine || '',
        city: updated.city || '',
        state: updated.state || '',
        postalCode: updated.postalCode || '',
        latitude: updated.latitude || null,
        longitude: updated.longitude || null,
      })
      setIsDirty(false)
      setSuccess('Location updated successfully.')
    } catch (err) {
      setError(err.message || 'Failed to update location')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setFormData({
      addressLine: ground.addressLine || '',
      city: ground.city || '',
      state: ground.state || '',
      postalCode: ground.postalCode || '',
      latitude: ground.latitude || null,
      longitude: ground.longitude || null,
    })
    setIsDirty(false)
    setError(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6">
        <div className="max-w-4xl mx-auto">
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
        <h1 className="text-3xl font-bold mb-2">Ground Location & Address</h1>
        <p className="text-slate-400 mb-6">Manage your cricket ground's location information</p>

        <div className="lg:flex lg:items-start lg:gap-6">
        <GroundNavTabs />

        <div className="min-w-0 flex-1">

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-500/50 rounded text-red-200">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-900/30 border border-green-500/50 rounded text-green-200">
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Address Details Form */}
          <div className="space-y-6">
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h2 className="text-xl font-semibold mb-4">Address Details</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Address Line
                  </label>
                  <input
                    type="text"
                    placeholder="123 Cricket Road"
                    value={formData.addressLine}
                    onChange={(e) => handleFieldChange('addressLine', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    {formData.addressLine.length}/255 characters
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      placeholder="Delhi"
                      value={formData.city}
                      onChange={(e) => handleFieldChange('city', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      placeholder="Delhi"
                      value={formData.state}
                      onChange={(e) => handleFieldChange('state', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Postal Code (6-digit PIN)
                  </label>
                  <input
                    type="text"
                    placeholder="110001"
                    value={formData.postalCode}
                    onChange={(e) => handleFieldChange('postalCode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength="6"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                  />
                </div>

                <div className="border-t border-slate-700 pt-4">
                  <h3 className="text-sm font-medium text-slate-300 mb-3">Coordinates</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Latitude
                      </label>
                      <div className="text-sm text-slate-300">
                        {formData.latitude !== null ? formData.latitude.toFixed(4) : 'Not set'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Longitude
                      </label>
                      <div className="text-sm text-slate-300">
                        {formData.longitude !== null ? formData.longitude.toFixed(4) : 'Not set'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Map and Coordinates */}
          <div className="space-y-6">
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h2 className="text-xl font-semibold mb-4">Set Location on Map</h2>
              <div className="bg-slate-700 rounded h-96 flex items-center justify-center">
                <LocationMapPicker onPick={handleMapPick} />
              </div>
              <p className="text-xs text-slate-400 mt-3">
                Click on the map to set your cricket ground's precise location
              </p>
            </div>

            {(formData.latitude !== null && formData.longitude !== null) && (
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h2 className="text-xl font-semibold mb-4">Current Location Preview</h2>
                <div className="bg-slate-700 rounded h-64">
                  <LocationMap
                    lat={formData.latitude}
                    lng={formData.longitude}
                    zoom={15}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex gap-4 justify-end">
          <button
            onClick={handleCancel}
            disabled={!isDirty || saving}
            className="px-6 py-2 bg-slate-700 text-white rounded font-medium hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="px-6 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {saving ? 'Saving...' : 'Save Location'}
          </button>
        </div>
        </div>
        </div>
      </div>
    </div>
  )
}
