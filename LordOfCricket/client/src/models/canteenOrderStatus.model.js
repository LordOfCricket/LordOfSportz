// Migrated off the legacy platform-wide canteenApi.js — see
// CUSTOMER_CANTEEN_MIGRATION_INSPECTION.md. Names kept identical to the old
// exports; every call now takes publicGroundId/publicCanteenId first.
import { fetchMyActiveOrder as fetchActiveOrder, fetchCanteenOrder as fetchOrder } from '../services/customerCanteenApi.js'
import { socketUrl } from '../services/socket.js'

export { fetchActiveOrder, fetchOrder, socketUrl }
export const CANTEEN_LATEST_ORDER_STORAGE_KEY = 'canteenLatestOrder'

export const STATUS_STEPS = [
  { status: 'Pending', title: 'Order Received', detail: 'Your order has reached the canteen and is waiting to be reviewed.' },
  { status: 'Accepted', title: 'Order Accepted', detail: 'The staff has accepted your order and it is now in preparation.' },
  { status: 'Preparing', title: 'Preparing', detail: 'Your food is being freshly prepared right now.' },
  { status: 'Ready', title: 'Ready', detail: 'Your order is ready for pickup at the counter.' },
  { status: 'Completed', title: 'Completed', detail: 'Order completed successfully.' },
]
