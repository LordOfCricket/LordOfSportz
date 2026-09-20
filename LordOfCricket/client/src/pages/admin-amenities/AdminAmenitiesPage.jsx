import { Trash2, Upload } from 'lucide-react'
import { useAdminAmenities } from '../../hooks/useAdminAmenities.js'

export default function AdminAmenitiesPage() {
  const {
    amenities,
    loading,
    file,
    setFile,
    name,
    setName,
    submitting,
    error,
    handleUpload,
    handleDelete,
  } = useAdminAmenities()

  return (
    <div className="min-h-screen bg-emerald-950 px-6 py-12">
      <div className="mx-auto flex max-w-3xl flex-col gap-10">
        <h1 className="text-3xl font-bold text-white">Manage Amenities</h1>

        <form
          onSubmit={handleUpload}
          className="flex flex-col gap-4 rounded-2xl border border-emerald-400/15 bg-white/5 p-6"
        >
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-emerald-100/70">Photo</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files[0])}
              className="rounded-lg border border-emerald-400/20 bg-emerald-950/50 px-3 py-2 text-sm text-white file:mr-4 file:rounded-md file:border-0 file:bg-emerald-500 file:px-3 file:py-1.5 file:text-emerald-950"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-emerald-100/70">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Parking"
              className="rounded-lg border border-emerald-400/20 bg-emerald-950/50 px-3 py-2 text-sm text-white placeholder:text-emerald-100/30"
              required
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !file || !name}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-linear-to-r from-emerald-400 to-emerald-600 px-6 py-3 text-sm font-semibold text-emerald-950 shadow-md shadow-emerald-500/30 transition-all hover:shadow-emerald-400/50 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {submitting ? 'Uploading…' : 'Upload Amenity'}
          </button>
        </form>

        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">
            Current Amenities {loading ? '' : `(${amenities.length})`}
          </h2>

          {loading ? (
            <p className="text-emerald-100/60">Loading…</p>
          ) : amenities.length === 0 ? (
            <p className="text-emerald-100/60">No amenities yet — upload one above.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {amenities.map((amenity) => (
                <div
                  key={amenity.id}
                  className="group relative overflow-hidden rounded-xl border border-emerald-400/15"
                >
                  <img
                    src={amenity.image_url}
                    alt={amenity.name}
                    className="h-32 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleDelete(amenity.id)}
                    aria-label="Delete amenity"
                    className="absolute right-2 top-2 rounded-full bg-red-500/90 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <p className="truncate bg-emerald-950/80 px-2 py-1 text-xs text-emerald-100">
                    {amenity.name}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
