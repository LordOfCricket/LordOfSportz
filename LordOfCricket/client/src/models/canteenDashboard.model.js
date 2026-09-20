import {
  fetchTodaysMenuConfig,
  fetchOrders,
  publishTodaysMenu,
  updateOrderStatus,
  fetchMasterMenu,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from '../services/canteenApi.js'

export {
  fetchTodaysMenuConfig,
  fetchOrders,
  publishTodaysMenu,
  updateOrderStatus,
  fetchMasterMenu,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
}

export const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'
export const STATUS_FLOW = ['Pending', 'Accepted', 'Preparing', 'Ready', 'Completed']
export const STAGE_ACTIONS = [
  { status: 'Pending', label: 'Pending' },
  { status: 'Accepted', label: 'Accept the Order' },
  { status: 'Preparing', label: 'Preparing the Order' },
  { status: 'Ready', label: 'Ready for Pickup' },
  { status: 'Completed', label: 'Complete Order' },
]

export function statusIndex(status) {
  const index = STATUS_FLOW.indexOf(status)
  return index === -1 ? 0 : index
}

export function statusBadgeClass(status) {
  if (status === 'Pending') return 'bg-amber-100 text-amber-800'
  if (status === 'Ready') return 'bg-emerald-100 text-emerald-800'
  return 'bg-blue-100 text-blue-800'
}

export function buildFoodFormData(food) {
  const formData = new FormData()
  formData.append('name', food.name)
  formData.append('category', food.category)
  formData.append('description', food.description)
  formData.append('price', food.price)
  if (food.imageFile) {
    formData.append('imageFile', food.imageFile)
  }
  return formData
}

export const emptyNewFood = { name: '', category: '', description: '', price: '', imageFile: null }
export const emptyEditFood = { id: '', name: '', category: '', description: '', price: '', image: '', imageFile: null }
