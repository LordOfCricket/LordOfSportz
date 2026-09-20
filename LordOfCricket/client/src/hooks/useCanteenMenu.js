import { useCallback, useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from './useAuth.js'
import {
  fetchActiveOrder,
  fetchMenu,
  fetchOrder,
  fetchOrderHistory,
  placeOrder,
  defaultCart,
  socketUrl,
  activeStatuses,
  CANTEEN_LATEST_ORDER_STORAGE_KEY,
  formatOrderDate,
  computeCartTotal,
} from '../models/canteenMenu.model.js'

export function useMenu() {
  const navigate = useNavigate()
  const { publicGroundId, publicCanteenId } = useParams()
  const { user } = useAuth()
  const userId = user?.id

  const [menu, setMenu] = useState([])
  const [cart, setCart] = useState(defaultCart)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [activeOrder, setActiveOrder] = useState(null)
  const [orderHistory, setOrderHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [detailsOrder, setDetailsOrder] = useState(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [error, setError] = useState('')
  const [placing, setPlacing] = useState(false)

  const loadPlayerOrders = useCallback(async () => {
    if (!userId) return
    try {
      const [currentOrder, history] = await Promise.all([
        fetchActiveOrder(publicGroundId, publicCanteenId, userId),
        fetchOrderHistory(publicGroundId, publicCanteenId, userId),
      ])
      setActiveOrder(currentOrder)
      setOrderHistory(history)
    } catch (err) {
      console.error('Unable to load player orders:', err)
      setActiveOrder(null)
      setOrderHistory([])
    }
  }, [userId, publicGroundId, publicCanteenId])

  useEffect(() => {
    if (!userId) {
      navigate('/login')
      return
    }

    async function loadPage() {
      try {
        const items = await fetchMenu(publicGroundId, publicCanteenId)
        setMenu(items)
      } catch (err) {
        // Ground/canteen-scoped now (see CUSTOMER_CANTEEN_MIGRATION_INSPECTION.md)
        // — a 404 here means a bad/unknown ground or canteen id, and a 409
        // means the canteen or ground is closed (CANTEEN_CLOSED/GROUND_CLOSED),
        // both real, already-server-verified conditions, never the old
        // legacy "multiple canteens exist" ambiguity this page used to be
        // vulnerable to.
        setError(err.response?.data?.message || err.response?.data?.error || 'Unable to load menu.')
      }

      loadPlayerOrders()
    }

    loadPage()
  }, [userId, navigate, publicGroundId, publicCanteenId, loadPlayerOrders])

  useEffect(() => {
    if (!userId) return

    const socket = io(socketUrl)
    let hasConnectedBefore = false

    const refreshMenu = async () => {
      const items = await fetchMenu(publicGroundId, publicCanteenId)
      setMenu(items)
    }

    const refreshPlayerOrders = (order) => {
      if (order.userId === userId) {
        loadPlayerOrders().catch(() => {})
      }
    }

    const updatePlayerOrder = (order) => {
      if (order.userId === userId) {
        loadPlayerOrders().catch(() => {})
        setDetailsOrder((current) => (current?.id === order.id ? order : current))
      }
    }

    // Socket.IO drops room membership on disconnect and never
    // auto-rejoins an app-level room on its own reconnect. Without re-emitting
    // 'join-user-room' here, a dropped connection silently stopped receiving
    // every canteen event forever after the first reconnect. On any reconnect
    // (not the first connect) also resync menu/orders via HTTP, since events
    // published while disconnected are gone for good otherwise.
    socket.on('connect', () => {
      socket.emit('join-user-room', userId)
      if (hasConnectedBefore) {
        refreshMenu().catch(() => {})
        loadPlayerOrders().catch(() => {})
      }
      hasConnectedBefore = true
    })

    socket.on('menu-updated', refreshMenu)
    socket.on('order-created', refreshPlayerOrders)
    socket.on('order-status-updated', updatePlayerOrder)
    socket.on('order-completed', updatePlayerOrder)

    return () => socket.disconnect()
  }, [userId, publicGroundId, publicCanteenId, loadPlayerOrders])

  const addItem = (item) => {
    if (activeOrder) {
      setError('You already have an active order.')
      return
    }

    setCart((prev) => {
      const existing = prev.items.find((x) => x.id === item.id)
      const items = existing
        ? prev.items.map((x) => (x.id === item.id ? { ...x, qty: x.qty + 1 } : x))
        : [...prev.items, { ...item, foodId: item.foodId || item.id, qty: 1 }]

      return {
        items,
        total: computeCartTotal(items),
      }
    })
  }

  const removeItem = (item) => {
    setCart((prev) => {
      const items = prev.items
        .map((x) => (x.id === item.id ? { ...x, qty: Math.max(0, x.qty - 1) } : x))
        .filter((item) => item.qty > 0)

      return {
        items,
        total: computeCartTotal(items),
      }
    })
  }

  const orderCount = useMemo(
    () => cart.items.reduce((sum, item) => sum + item.qty, 0),
    [cart.items],
  )

  const groupedHistory = useMemo(() => {
    return orderHistory.reduce((groups, order) => {
      const key = formatOrderDate(order.orderedAt || order.createdAt)
      if (!groups[key]) groups[key] = []
      groups[key].push(order)
      return groups
    }, {})
  }, [orderHistory])

  const handlePlaceOrder = async () => {
    if (activeOrder) {
      setError('You already have an active order.')
      setConfirmOpen(false)
      return
    }

    if (!orderCount) {
      setError('Please add at least one item.')
      return
    }

    setError('')
    setPlacing(true)

    try {
      const order = await placeOrder(publicGroundId, publicCanteenId, {
        items: cart.items,
        total: cart.total,
      })

      localStorage.setItem(
        CANTEEN_LATEST_ORDER_STORAGE_KEY,
        JSON.stringify({
          orderId: order.id,
          userId,
        }),
      )

      setActiveOrder(activeStatuses.includes(order.status) ? order : null)
      setConfirmOpen(false)
      setCart(defaultCart)

      navigate(`/grounds/${publicGroundId}/canteen/${publicCanteenId}/order-status`, {
        state: {
          orderId: order.id,
        },
      })
    } catch (err) {
      // Phase 22.4 — a 409 is not always "you already have an active
      // order": the backend also uses 409 for a closed canteen
      // (CANTEEN_CLOSED), a suspended ground (GROUND_CLOSED), an item that
      // just sold out (INSUFFICIENT_STOCK), or one that just became
      // unavailable (ITEM_UNAVAILABLE) — every one of those responses
      // carries a `code` field and no `order` field, while the genuine
      // "already have an active order" response carries `order` and no
      // `code`. Only the latter should show the active-order message and
      // populate activeOrder; every coded 409 shows its own real message.
      if (err.response?.status === 409) {
        const { code, error: message, order } = err.response.data || {}
        if (!code && order) {
          setActiveOrder(order)
          setError('You already have an active order.')
          setConfirmOpen(false)
          return
        }
        setError(message || 'Unable to place order.')
        setConfirmOpen(false)
        return
      }
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to place order.')
    } finally {
      setPlacing(false)
    }
  }

  const handleTrackOrder = () => {
    if (!activeOrder) return
    navigate(`/grounds/${publicGroundId}/canteen/${publicCanteenId}/order-status`, {
      state: {
        orderId: activeOrder.id,
      },
    })
  }

  const handleViewDetails = async (orderId) => {
    setLoadingDetails(true)
    setError('')
    try {
      const order = await fetchOrder(publicGroundId, publicCanteenId, orderId)
      setDetailsOrder(order)
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to load order details.')
    } finally {
      setLoadingDetails(false)
    }
  }

  return {
    menu,
    cart,
    confirmOpen,
    setConfirmOpen,
    activeOrder,
    orderHistory,
    showHistory,
    setShowHistory,
    detailsOrder,
    setDetailsOrder,
    loadingDetails,
    error,
    placing,
    orderCount,
    groupedHistory,
    addItem,
    removeItem,
    handlePlaceOrder,
    handleTrackOrder,
    handleViewDetails,
  }
}
