import { OwnerMatchStatus, OwnerStaffRole, OwnerUmpireSlotStatus, UmpirePaymentStatus } from '../types'

export type BadgeTone = 'positive' | 'neutral' | 'warn' | 'danger' | 'info'

export interface StatusMeta {
  label: string
  tone: BadgeTone
}

export function matchStatusMeta(status: OwnerMatchStatus): StatusMeta {
  switch (status) {
    case 'upcoming':
      return { label: 'Upcoming', tone: 'info' }
    case 'live':
      return { label: 'Live', tone: 'positive' }
    case 'completed':
      return { label: 'Completed', tone: 'neutral' }
    case 'finalized':
      return { label: 'Finalized', tone: 'neutral' }
    case 'cancelled':
      return { label: 'Cancelled', tone: 'danger' }
    default:
      return { label: status, tone: 'neutral' }
  }
}

export function slotStatusMeta(status: OwnerUmpireSlotStatus): StatusMeta {
  switch (status) {
    case 'AVAILABLE':
      return { label: 'Open', tone: 'warn' }
    case 'ASSIGNED':
      return { label: 'Assigned', tone: 'positive' }
    case 'COMPLETED':
      return { label: 'Completed', tone: 'neutral' }
    case 'CANCELLED':
      return { label: 'Cancelled', tone: 'neutral' }
    case 'NO_SHOW':
      return { label: 'No-show', tone: 'danger' }
    default:
      return { label: status, tone: 'neutral' }
  }
}

export function paymentStatusMeta(status: UmpirePaymentStatus): StatusMeta {
  switch (status) {
    case 'PENDING':
      return { label: 'Payment pending', tone: 'warn' }
    case 'APPROVED':
      return { label: 'Payment approved', tone: 'info' }
    case 'PAID':
      return { label: 'Paid', tone: 'positive' }
    case 'FAILED':
      return { label: 'Payment failed', tone: 'danger' }
    case 'CANCELLED':
      return { label: 'Payment cancelled', tone: 'neutral' }
    default:
      return { label: status, tone: 'neutral' }
  }
}

// Mirrors the backend payment-status state machine
// (server/src/domain/umpireCommerce/paymentStatus.js). Terminal states have
// no outgoing transitions.
const PAYMENT_TRANSITIONS: Record<UmpirePaymentStatus, UmpirePaymentStatus[]> = {
  PENDING: ['APPROVED', 'PAID', 'CANCELLED', 'FAILED'],
  APPROVED: ['PAID', 'CANCELLED', 'FAILED'],
  PAID: [],
  FAILED: [],
  CANCELLED: [],
}

export function nextPaymentStatuses(current: UmpirePaymentStatus): UmpirePaymentStatus[] {
  return PAYMENT_TRANSITIONS[current] ?? []
}

// Mirrors client/src/models/staffingForecast.model.js's staffingForecastLabel
// — same backend STAFFING_STATUS values (domain/umpireRecommendation/
// staffingForecast.js), same label text, same *Meta(status)->{label,tone}
// shape as matchStatusMeta/slotStatusMeta/paymentStatusMeta above.
export function staffingForecastMeta(status: string): StatusMeta {
  switch (status) {
    case 'FULLY_STAFFED':
      return { label: 'Fully staffed', tone: 'positive' }
    case 'NEEDS_ATTENTION':
      return { label: 'Needs attention', tone: 'danger' }
    case 'OPEN':
      return { label: 'Open', tone: 'info' }
    case 'NOT_REQUIRED':
      return { label: 'No umpires required', tone: 'neutral' }
    default:
      return { label: status, tone: 'neutral' }
  }
}

export function staffRoleLabel(role: OwnerStaffRole): string {
  return role === 'GROUND_ADMIN' ? 'Ground Admin' : role === 'CANTEEN_STAFF' ? 'Canteen Staff' : role
}

// Display-only grouping of catalog permission keys by their prefix — the
// backend catalog is a flat { key, description } list with no categories.
export function permissionGroupLabel(key: string): string {
  const prefix = key.split('_')[0]
  switch (prefix) {
    case 'MATCH':
      return 'Matches'
    case 'UMPIRE':
      return 'Umpires'
    case 'BOOKING':
      return 'Bookings'
    case 'PRICING':
      return 'Pricing'
    case 'STAFF':
      return 'Staff'
    default:
      return 'Other'
  }
}
