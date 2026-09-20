import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuth } from './useAuth.js'
import {
  fetchActiveOrder,
  fetchOrder,
  socketUrl,
  CANTEEN_LATEST_ORDER_STORAGE_KEY,
  STATUS_STEPS,
} from '../models/canteenOrderStatus.model.js'

export function useOrderStatus() {
  const navigate = useNavigate()
  const location = useLocation()
  const { publicGroundId, publicCanteenId } = useParams()
  const { user } = useAuth()
  const storedOrder = useMemo(
    () => (typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(CANTEEN_LATEST_ORDER_STORAGE_KEY) || 'null') : null),
    [],
  )
  const { orderId: stateOrderId } = location.state || {}
  const [orderId, setOrderId] = useState(stateOrderId || storedOrder?.orderId || '')
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!orderId) {
      const userId = storedOrder?.userId || user?.id
      if (userId) {
        fetchActiveOrder(publicGroundId, publicCanteenId, userId)
          .then((found) => {
            if (found) {
              setOrder(found)
              setOrderId(found.id)
              localStorage.setItem(CANTEEN_LATEST_ORDER_STORAGE_KEY, JSON.stringify({ orderId: found.id, userId: found.userId, seatId: found.seatId }))
              return
            }
            navigate(`/grounds/${publicGroundId}/canteen/${publicCanteenId}/menu`)
          })
          .catch(() => navigate(`/grounds/${publicGroundId}/canteen/${publicCanteenId}/menu`))
      } else {
        navigate('/login')
      }
      return
    }

    fetchOrder(publicGroundId, publicCanteenId, orderId)
      .then(setOrder)
      .catch((err) => setError(err.response?.data?.message || err.response?.data?.error || 'Unable to load order.'))
  }, [navigate, orderId, storedOrder, user?.id, publicGroundId, publicCanteenId])

  useEffect(() => {
    if (!orderId) return
    // withCredentials — the server's join-order-room/join-user-room handlers
    // now authenticate via the same HttpOnly session cookie every REST call
    // already sends (see server.js/realtime/socketAuth.js); without this,
    // Socket.IO won't attach the cookie to a cross-origin handshake and both
    // joins would be silently rejected. Same option useMatchChat.js already
    // uses for the identical reason.
    const socket = io(socketUrl, { withCredentials: true })
    let hasConnectedBefore = false

    const updateOrder = (updated) => {
      if (updated.id === orderId) {
        setOrder(updated)
      }
    }

    // Socket.IO drops room membership on disconnect and never
    // auto-rejoins an app-level room on its own reconnect; re-emit the joins
    // every time, and resync the order via HTTP on any reconnect (not the
    // first connect) since a status update published while disconnected would
    // otherwise never arrive.
    socket.on('connect', () => {
      socket.emit('join-order-room', orderId)
      if (order?.userId) socket.emit('join-user-room', order.userId)
      if (hasConnectedBefore) {
        fetchOrder(publicGroundId, publicCanteenId, orderId).then(setOrder).catch(() => {})
      }
      hasConnectedBefore = true
    })

    socket.on('order-status-updated', updateOrder)
    socket.on('order-completed', updateOrder)
    return () => socket.disconnect()
  }, [orderId, order?.userId, publicGroundId, publicCanteenId])

  const activeIndex = useMemo(() => {
    if (order?.status === 'Cancelled') return -1
    return STATUS_STEPS.findIndex((step) => step.status === (order?.status || 'Pending'))
  }, [order])

  const currentStep = activeIndex >= 0 ? STATUS_STEPS[activeIndex] : null

  return {
    order,
    error,
    steps: STATUS_STEPS,
    activeIndex,
    currentStep,
    handleBackToMenu: () => navigate(`/grounds/${publicGroundId}/canteen/${publicCanteenId}/menu`),
  }
}
