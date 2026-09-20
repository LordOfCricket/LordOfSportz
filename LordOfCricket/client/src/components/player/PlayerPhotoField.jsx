import { useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import Avatar from '../ui/Avatar.jsx'

// Same multipart choose-from-device flow as ProfileEditPage's original
// PhotoPicker (multer memory storage -> Cloudinary stream, POST
// /me/player/photo) — this is that same pattern, exported as a shared
// component so onboarding and Edit Profile stay on one upload path, plus a
// Remove action ProfileEditPage's version didn't have yet. "Preview" is the
// Avatar itself: it already reflects whatever photoUrl the parent passes,
// swapping to the freshly uploaded URL the moment the request resolves —
// no separate local-only staging concept, since the backend has no
// "staged but not yet saved" upload state to stage into.
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_PHOTO_BYTES = 10 * 1024 * 1024

export default function PlayerPhotoField({ name, photoUrl, onUpload, onRemove }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = '' // lets picking the same file twice re-fire onChange
    if (!file) return

    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setError('Only JPEG, PNG, or WEBP images are allowed.')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('Image must be 10MB or smaller.')
      return
    }

    setError('')
    setBusy(true)
    try {
      await onUpload(file)
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed. Try a different photo.')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    setError('')
    setBusy(true)
    try {
      await onRemove()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not remove the photo. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Avatar name={name} photoUrl={photoUrl} size="lg" />
      <input ref={inputRef} type="file" accept={ALLOWED_PHOTO_TYPES.join(',')} onChange={handleFile} className="hidden" />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          <Camera className="h-4 w-4" />
          {busy ? 'Working…' : photoUrl ? 'Replace Photo' : 'Choose Photo'}
        </button>
        {photoUrl && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-red-500/10 hover:text-rose-300 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            Remove
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400">Optional. JPEG, PNG, or WEBP. Up to 10MB.</p>
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  )
}
