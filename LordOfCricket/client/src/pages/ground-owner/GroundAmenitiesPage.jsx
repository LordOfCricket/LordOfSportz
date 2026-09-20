import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import GroundOwnerLayout from '../../components/ground-owner/GroundOwnerLayout.jsx'
import GroundNavTabs from '../../components/ground-owner/GroundNavTabs.jsx'
import {
  fetchGroundAmenities,
  addGroundAmenity,
  removeGroundAmenity,
} from '../../services/groundOwnerApi.js'
import { fetchAmenityCatalog } from '../../services/groundRegistrationApi.js'
import AmenityIcon from '../../components/common/AmenityIcon.jsx'

export default function GroundAmenitiesPage() {
  const { publicGroundId } = useParams()
  const [amenities, setAmenities] = useState([])
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [removingKey, setRemovingKey] = useState(null)
  const [addingKey, setAddingKey] = useState(null)
  const [confirmRemoveKey, setConfirmRemoveKey] = useState(null)

  const loadData = useCallback(() => {
    return Promise.resolve()
      .then(() => {
        setLoading(true)
        setError(null)
        // Fetch both amenities and catalog in parallel
        return Promise.all([
          fetchGroundAmenities(publicGroundId),
          fetchAmenityCatalog(),
        ])
      })
      .then(([amenitiesData, catalogData]) => {
        setAmenities(amenitiesData || [])
        setCatalog(catalogData || [])
      })
      .catch((err) => setError(err.response?.data?.error || err.message || "Couldn't load amenities."))
      .finally(() => setLoading(false))
  }, [publicGroundId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleAddAmenity = async (amenityKey) => {
    setAddingKey(amenityKey)
    try {
      const updated = await addGroundAmenity(publicGroundId, amenityKey)
      setAmenities(updated)
      setError(null)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add amenity.')
    } finally {
      setAddingKey(null)
    }
  }

  const handleRemoveAmenity = async (amenityKey) => {
    setRemovingKey(amenityKey)
    try {
      const updated = await removeGroundAmenity(publicGroundId, amenityKey)
      setAmenities(updated)
      setConfirmRemoveKey(null)
      setError(null)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove amenity.')
    } finally {
      setRemovingKey(null)
    }
  }

  const selectedKeys = new Set(amenities.map(a => a.key))
  const availableAmenities = catalog.filter(a => !selectedKeys.has(a.key))

  return (
    <GroundOwnerLayout>
      <div className="lg:flex lg:items-start lg:gap-6">
        <GroundNavTabs />

        <div className="min-w-0 flex-1">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">Amenities</h1>
        <p className="mt-2 text-slate-400">Manage the amenities displayed on your public ground page.</p>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center rounded-[1.5rem] border border-white/10 bg-slate-900/50 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      )}

      {!loading && (
        <div className="space-y-6">
          {/* CURRENT AMENITIES SECTION */}
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
            <h3 className="mb-4 text-lg font-semibold text-white">Current Amenities</h3>

            {amenities.length === 0 ? (
              <p className="text-slate-400">No amenities selected yet. Add some below to display on your ground page.</p>
            ) : (
              <div className="space-y-2">
                {amenities.map(amenity => (
                  <div
                    key={amenity.key}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <AmenityIcon name={amenity.icon} className="h-5 w-5 text-emerald-400" />
                      <span className="font-medium text-white">{amenity.name}</span>
                    </div>
                    {confirmRemoveKey === amenity.key ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmRemoveKey(null)}
                          disabled={removingKey === amenity.key}
                          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/5 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleRemoveAmenity(amenity.key)}
                          disabled={removingKey === amenity.key}
                          className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
                        >
                          {removingKey === amenity.key ? 'Removing...' : 'Remove'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmRemoveKey(amenity.key)}
                        disabled={removingKey === amenity.key}
                        className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500/10 hover:border-red-400/30 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ADD AMENITIES SECTION */}
          {availableAmenities.length > 0 && (
            <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
              <h3 className="mb-4 text-lg font-semibold text-white">Add Amenities</h3>
              <div className="flex flex-wrap gap-2">
                {availableAmenities.map(amenity => (
                  <button
                    key={amenity.key}
                    onClick={() => handleAddAmenity(amenity.key)}
                    disabled={addingKey === amenity.key}
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-emerald-400/50 hover:bg-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <AmenityIcon name={amenity.icon} className="h-4 w-4" />
                    {addingKey === amenity.key ? 'Adding...' : amenity.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {amenities.length === catalog.length && (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              All available amenities have been added to your ground. ✓
            </div>
          )}
        </div>
      )}
        </div>
      </div>
    </GroundOwnerLayout>
  )
}
