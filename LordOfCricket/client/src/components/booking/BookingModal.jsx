import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { X, CalendarDays, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useBookingFlow } from '../../hooks/useBookingFlow.js'
import { formatSlotTime, formatBookingDate, todayDateInputValue } from '../../models/booking.model.js'
import Button from '../ui/Button.jsx'

// Homepage -> Book Ground -> Calendar ->
// Choose Date -> Available Times -> Booking Details -> Confirm -> Confirmed.
// Internally scrollable (max-h + overflow-y-auto) so it fits at 390x844
// without the page itself scrolling.
export default function BookingModal({ open, onClose, publicGroundId = null }) {
  const flow = useBookingFlow(publicGroundId)

  useEffect(() => {
    if (open) flow.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-emerald-950">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-bold text-white">Book The Ground</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          {flow.step === 'date' && (
            <div>
              <p className="text-sm text-slate-300">Pick a date to see available time slots.</p>
              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Date</span>
                <input
                  type="date"
                  min={todayDateInputValue()}
                  value={flow.dateStr}
                  onChange={(e) => flow.setDateStr(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-base text-white"
                />
              </label>
              {flow.error && <p className="mt-3 text-sm text-rose-300">{flow.error}</p>}
              <Button disabled={flow.loadingSlots} onClick={() => flow.chooseDate(flow.dateStr)} className="mt-5 h-12 w-full">
                {flow.loadingSlots ? 'Checking availability…' : 'Check Availability'}
              </Button>
            </div>
          )}

          {flow.step === 'slots' && (
            <div>
              <button type="button" onClick={() => flow.setStep('date')} className="text-xs font-semibold text-emerald-300 hover:text-emerald-200">
                ← Change date
              </button>
              <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                <CalendarDays className="h-4 w-4 text-emerald-300" />
                {formatBookingDate(flow.dateStr)}
              </p>

              {flow.loadingSlots ? (
                <p className="mt-4 text-sm text-slate-400">Loading time slots…</p>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {flow.slots.map((slot) => {
                    // Ground Pricing UX Polish — a slot can be schedule-
                    // AVAILABLE but have no active pricing configured; that's
                    // treated the same as unbookable here (the server would
                    // reject it with PRICE_UNAVAILABLE anyway), rather than
                    // letting a customer pick a time they can't actually
                    // confirm.
                    const priced = slot.price != null
                    const bookable = slot.status === 'AVAILABLE' && priced
                    return (
                      <button
                        key={slot.startTime}
                        type="button"
                        disabled={!bookable}
                        onClick={() => flow.chooseSlot(slot)}
                        aria-label={`${formatSlotTime(slot.startTime, slot.endTime)} — ${bookable ? 'available' : 'unavailable'}`}
                        className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-colors ${
                          bookable ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20' : 'cursor-not-allowed border-white/10 bg-white/5 text-slate-500'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {formatSlotTime(slot.startTime, slot.endTime)}
                        </span>
                        {slot.status === 'AVAILABLE' ? (
                          <span className={`text-[11px] font-medium uppercase tracking-wide ${priced ? '' : 'normal-case tracking-normal'}`}>
                            {priced ? `₹${slot.price.toLocaleString('en-IN')}` : 'Price unavailable'}
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium uppercase tracking-wide">Unavailable</span>
                        )}
                      </button>
                    )
                  })}
                  {flow.slots.length === 0 && <p className="col-span-2 text-sm text-slate-400">No slots configured for this date.</p>}
                </div>
              )}
            </div>
          )}

          {flow.step === 'form' && flow.selectedSlot && (
            <div>
              <button type="button" onClick={() => flow.setStep('slots')} className="text-xs font-semibold text-emerald-300 hover:text-emerald-200">
                ← Change time
              </button>
              <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                <p className="text-sm font-semibold text-white">{formatBookingDate(flow.selectedSlot.startTime)}</p>
                <p className="text-sm text-emerald-200">{formatSlotTime(flow.selectedSlot.startTime, flow.selectedSlot.endTime)}</p>
                {flow.selectedSlot.price != null && (
                  <div className="mt-3 flex items-center justify-between border-t border-emerald-400/20 pt-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-emerald-200/80">Ground Fee</span>
                    <span className="text-lg font-bold text-[#F5D547]">₹{flow.selectedSlot.price.toLocaleString('en-IN')}</span>
                  </div>
                )}
              </div>

              {!flow.isLoggedIn ? (
                <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-500/10 p-4 text-center">
                  <p className="text-sm text-amber-100">Log in to confirm this booking.</p>
                  <Link to="/login" onClick={onClose} className="mt-3 inline-flex items-center justify-center rounded-xl bg-linear-to-r from-emerald-400 to-emerald-600 px-5 py-2.5 text-sm font-bold text-emerald-950">
                    Log In
                  </Link>
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Purpose (optional)</span>
                    <input
                      value={flow.form.purpose}
                      onChange={(e) => flow.updateForm({ purpose: e.target.value })}
                      placeholder="Practice nets, friendly match…"
                      className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-slate-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Expected Players (optional)</span>
                    <input
                      type="number"
                      min="1"
                      value={flow.form.expectedPlayers}
                      onChange={(e) => flow.updateForm({ expectedPlayers: e.target.value })}
                      className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Contact Phone (optional)</span>
                    <input
                      value={flow.form.contactPhone}
                      onChange={(e) => flow.updateForm({ contactPhone: e.target.value })}
                      className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white"
                    />
                  </label>

                  {flow.error && <p className="text-sm text-rose-300">{flow.error}</p>}

                  <Button disabled={flow.submitting} onClick={flow.submit} className="h-12 w-full">
                    {flow.submitting
                      ? 'Confirming…'
                      : flow.selectedSlot.price != null
                        ? `Confirm Booking — ₹${flow.selectedSlot.price.toLocaleString('en-IN')}`
                        : 'Confirm Booking'}
                  </Button>
                </div>
              )}
            </div>
          )}

          {flow.step === 'conflict' && (
            <div>
              <div className="flex items-start gap-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
                <p className="text-sm text-rose-100">This time was just booked or is unavailable.</p>
              </div>

              {flow.alternatives.length > 0 ? (
                <>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Nearby Available Times</p>
                  <div className="mt-3 space-y-2">
                    {flow.alternatives.map((slot) => (
                      <button
                        key={slot.startTime}
                        type="button"
                        onClick={() => flow.chooseAlternative(slot)}
                        className="flex w-full items-center justify-between rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-left text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20"
                      >
                        <span>{formatBookingDate(slot.startTime)}</span>
                        <span>{formatSlotTime(slot.startTime, slot.endTime)}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm text-slate-400">No nearby alternatives were available — try a different date.</p>
              )}

              <Button onClick={() => flow.setStep('date')} className="mt-5 h-12 w-full bg-white/10 text-white">
                Choose a Different Date
              </Button>
            </div>
          )}

          {flow.step === 'success' && flow.confirmedBooking && (
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
              <h3 className="mt-3 text-xl font-bold text-white">Booking Confirmed</h3>
              <div className="mt-4 space-y-1 rounded-xl border border-white/10 bg-white/5 p-4 text-left">
                <p className="text-sm text-slate-400">
                  Date <span className="float-right font-semibold text-white">{formatBookingDate(flow.confirmedBooking.startTime)}</span>
                </p>
                <p className="text-sm text-slate-400">
                  Time <span className="float-right font-semibold text-white">{formatSlotTime(flow.confirmedBooking.startTime, flow.confirmedBooking.endTime)}</span>
                </p>
                <p className="text-sm text-slate-400">
                  Booking Reference <span className="float-right font-semibold text-emerald-300">{flow.confirmedBooking.publicBookingId}</span>
                </p>
                {flow.confirmedBooking.amount != null && (
                  <>
                    <div className="my-2 border-t border-white/10" />
                    <p className="text-sm text-slate-400">
                      Ground Fee <span className="float-right font-semibold text-white">₹{Number(flow.confirmedBooking.amount).toLocaleString('en-IN')}</span>
                    </p>
                    <p className="text-sm font-semibold text-slate-300">
                      Total <span className="float-right font-bold text-[#F5D547]">₹{Number(flow.confirmedBooking.amount).toLocaleString('en-IN')}</span>
                    </p>
                  </>
                )}
              </div>
              <Link to="/bookings" onClick={onClose} className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-linear-to-r from-emerald-400 to-emerald-600 px-5 py-3 text-sm font-bold text-emerald-950">
                View My Bookings
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
