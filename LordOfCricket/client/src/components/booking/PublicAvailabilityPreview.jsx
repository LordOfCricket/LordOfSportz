import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { fetchAvailability } from '../../services/bookingApi.js'
import { formatSlotTime, todayDateInputValue } from '../../models/booking.model.js'
import useGlowHover from '../../hooks/useGlowHover.js'
import GlowOverlay from '../common/GlowOverlay.jsx'

const PREVIEW_SLOT_COUNT = 4

// Public, no-login availability check on the homepage.
// Only ever exposes AVAILABLE/UNAVAILABLE (never a reason, never any
// customer data) — the exact same public shape GET /bookings/availability
// already returns for an unauthenticated caller.
// `publicGroundId` is optional (Ground Time-Slot Pricing) — when known
// (e.g. rendered on a specific ground's homepage), the preview reflects
// THAT ground's own availability; omitted, this keeps the previous
// platform-default-ground behavior.
export default function PublicAvailabilityPreview({ publicGroundId = null, light = false }) {
  const [slots, setSlots] = useState(null)
  const [error, setError] = useState(false)
  const { enabled: glowEnabled, ref: glowRef, onPointerMove: onGlowMove, onPointerLeave: onGlowLeave } = useGlowHover()

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchAvailability(todayDateInputValue(), publicGroundId)
        .then(setSlots)
        .catch(() => setError(true))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [publicGroundId])

  if (error) return null
  if (!slots) {
    return <div className={`h-16 w-full max-w-md animate-pulse rounded-2xl ${light ? "bg-loc-mint" : "bg-white/5"}`} />
  }

  const nextAvailable = slots.filter((s) => s.status === 'AVAILABLE').slice(0, PREVIEW_SLOT_COUNT)

  return (
    <div
      ref={glowRef}
      {...(glowEnabled ? { onPointerMove: onGlowMove, onPointerLeave: onGlowLeave } : {})}
      className={`relative w-full max-w-md rounded-2xl border p-4 text-left ${light ? "border-loc-border bg-loc-mint" : "border-white/10 bg-white/5"}`}
    >
      {glowEnabled && <GlowOverlay />}
      <p className={`text-xs font-bold uppercase tracking-wide ${light ? "text-loc-green" : "text-emerald-300"}`}>Today's Availability</p>
      {nextAvailable.length === 0 ? (
        <p className={`mt-2 flex items-center gap-2 text-sm ${light ? "text-loc-muted" : "text-slate-300"}`}>
          <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
          No slots left today — pick another date in the booking flow.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {nextAvailable.map((s) => (
            <span key={s.startTime} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${light ? "border-loc-border bg-loc-mint text-loc-green" : "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"}`}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {formatSlotTime(s.startTime, s.endTime)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
