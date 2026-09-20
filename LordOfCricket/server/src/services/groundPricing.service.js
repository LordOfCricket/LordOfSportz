import {
  findAllByGround,
  findActiveByGround,
  findById,
  createSlot,
  updateSlot,
  deleteSlot,
} from '../models/groundPricingSlot.model.js'
import { hasOverlappingActiveSlot, timeToMinutes, findSlotContainingTime } from '../domain/groundPricing/pricing.js'
import { BookingError, BOOKING_ERROR_CODES as CODES } from '../domain/booking/errors.js'
import * as auditLogService from './groundAuditLog.service.js'

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/

function validateTimeRange(startTime, endTime) {
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
    throw new BookingError(CODES.INVALID_PRICING_SLOT, 'startTime/endTime must be HH:MM (24-hour).')
  }
  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
    throw new BookingError(CODES.INVALID_PRICING_SLOT, 'startTime must be before endTime.')
  }
}

function validatePrice(price) {
  const amount = Number(price)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new BookingError(CODES.INVALID_PRICING_SLOT, 'price must be a non-negative number.')
  }
  return amount
}

async function resolveOwnedSlot(ground, slotId) {
  const slot = await findById(slotId)
  if (!slot || slot.ground_id !== ground.id) {
    throw new BookingError(CODES.PRICING_SLOT_NOT_FOUND, 'Pricing slot not found for this ground.')
  }
  return slot
}

// Owner-facing (Ground Pricing management page) — every slot, active or not.
export async function listPricingSlots(ground) {
  return findAllByGround(ground.id)
}

// Public-facing (ground profile page, homepage) — active only, never leaks
// a deactivated/draft price band to a customer.
export async function listActivePricingSlots(groundId) {
  return findActiveByGround(groundId)
}

export async function createPricingSlot(ground, { startTime, endTime, price }, actingUserId) {
  validateTimeRange(startTime, endTime)
  const amount = validatePrice(price)

  const existing = await findAllByGround(ground.id)
  if (hasOverlappingActiveSlot(existing, timeToMinutes(startTime), timeToMinutes(endTime))) {
    throw new BookingError(CODES.PRICING_SLOT_OVERLAP, 'This time range overlaps an existing active pricing slot.')
  }

  const slot = await createSlot({ groundId: ground.id, startTime, endTime, price: amount })
  await auditLogService.logEvent({ entityType: 'PRICING_SLOT', entityId: slot.id, action: 'CREATED', actorUserId: actingUserId, newValue: slot })
  return slot
}

export async function updatePricingSlot(ground, slotId, { startTime, endTime, price, isActive }, actingUserId) {
  const existingSlot = await resolveOwnedSlot(ground, slotId)

  const nextStart = startTime ?? existingSlot.start_time
  const nextEnd = endTime ?? existingSlot.end_time
  const nextActive = isActive ?? existingSlot.is_active
  validateTimeRange(nextStart, nextEnd)

  const fields = {}
  if (startTime !== undefined) fields.start_time = startTime
  if (endTime !== undefined) fields.end_time = endTime
  if (price !== undefined) fields.price = validatePrice(price)
  if (isActive !== undefined) fields.is_active = Boolean(isActive)

  // Overlap only matters if the result would be ACTIVE with a (possibly
  // new) time range — re-checked against every OTHER slot for this ground.
  if (nextActive) {
    const others = await findAllByGround(ground.id)
    if (hasOverlappingActiveSlot(others, timeToMinutes(nextStart), timeToMinutes(nextEnd), existingSlot.id)) {
      throw new BookingError(CODES.PRICING_SLOT_OVERLAP, 'This time range overlaps an existing active pricing slot.')
    }
  }

  const updated = await updateSlot(slotId, fields)
  const action = isActive !== undefined && Object.keys(fields).length === 1 ? (isActive ? 'ACTIVATED' : 'DEACTIVATED') : 'UPDATED'
  await auditLogService.logEvent({ entityType: 'PRICING_SLOT', entityId: slotId, action, actorUserId: actingUserId, previousValue: existingSlot, newValue: updated })
  return updated
}

export async function deletePricingSlot(ground, slotId, actingUserId) {
  const existingSlot = await resolveOwnedSlot(ground, slotId)
  const deleted = await deleteSlot(slotId)
  // ground_bookings.pricing_slot_id ON DELETE SET NULL is the real "safe to
  // delete" guarantee (see groundPricingSlot.model.js's own comment) — a
  // historical booking's amount is independently snapshotted, never
  // affected by this.
  await auditLogService.logEvent({ entityType: 'PRICING_SLOT', entityId: slotId, action: 'DELETED', actorUserId: actingUserId, previousValue: existingSlot })
  return deleted
}

// The single authoritative price-lookup — used by groundBooking.service.js
// at booking-creation time (server-side, NEVER a frontend-supplied amount)
// and by the frontend's own "preview the price before confirming" call
// against the same active-slot data. `startTime` is 'HH:MM' or 'HH:MM:SS'
// local ground time (the same hour/minute the booking's own start aligns
// to — see domain/groundPricing/pricing.js#findSlotContainingTime's own
// comment on why this is a start-time-only lookup, never a range check).
// Returns null (not an error, not a fabricated ₹0) when no active slot
// covers the time — "price on request", the same honest-empty-state
// principle the homepage's own MIN(active price) card uses.
export async function computeApplicablePrice(groundId, startTime) {
  const activeSlots = await findActiveByGround(groundId)
  const slot = findSlotContainingTime(activeSlots, timeToMinutes(startTime))
  if (!slot) return null
  return { pricingSlotId: slot.id, amount: Number(slot.price) }
}
