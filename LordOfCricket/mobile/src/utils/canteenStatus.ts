import { CanteenOrderStatus } from '../types'
import { BadgeTone } from './ownerStatus'

// The 6 statuses the backend accepts (canteenOrder.model.js PRESET_STATUS).
export const CANTEEN_ORDER_STATUSES: CanteenOrderStatus[] = [
  'Pending',
  'Accepted',
  'Preparing',
  'Ready',
  'Completed',
  'Cancelled',
]

// Non-terminal statuses (canteenOrder.model.js ACTIVE_STATUSES) — an order
// still needing kitchen action.
export const ACTIVE_CANTEEN_ORDER_STATUSES: CanteenOrderStatus[] = ['Pending', 'Accepted', 'Preparing', 'Ready']

export function orderStatusMeta(status: CanteenOrderStatus): { label: string; tone: BadgeTone } {
  switch (status) {
    case 'Pending':
      return { label: 'Pending', tone: 'warn' }
    case 'Accepted':
      return { label: 'Accepted', tone: 'info' }
    case 'Preparing':
      return { label: 'Preparing', tone: 'info' }
    case 'Ready':
      return { label: 'Ready', tone: 'positive' }
    case 'Completed':
      return { label: 'Completed', tone: 'neutral' }
    case 'Cancelled':
      return { label: 'Cancelled', tone: 'danger' }
    default:
      return { label: status, tone: 'neutral' }
  }
}

// The backend accepts any PRESET_STATUS -> PRESET_STATUS transition (no
// state machine). This is the sensible forward flow surfaced in the UI:
// advance one step, or cancel while not finished. Completed/Cancelled are
// terminal here.
const FORWARD: Partial<Record<CanteenOrderStatus, { label: string; target: CanteenOrderStatus }>> = {
  Pending: { label: 'Accept order', target: 'Accepted' },
  Accepted: { label: 'Start preparing', target: 'Preparing' },
  Preparing: { label: 'Mark ready', target: 'Ready' },
  Ready: { label: 'Complete order', target: 'Completed' },
}

export interface OrderAction {
  label: string
  target: CanteenOrderStatus
  destructive?: boolean
}

export function nextOrderActions(status: CanteenOrderStatus): OrderAction[] {
  const actions: OrderAction[] = []
  const forward = FORWARD[status]
  if (forward) actions.push(forward)
  if (status !== 'Completed' && status !== 'Cancelled') {
    actions.push({ label: 'Cancel order', target: 'Cancelled', destructive: true })
  }
  return actions
}
