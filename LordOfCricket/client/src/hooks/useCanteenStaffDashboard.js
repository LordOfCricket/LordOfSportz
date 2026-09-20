import { useCallback, useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import {
  fetchTodaysMenuConfig,
  fetchOrders,
  publishTodaysMenu,
  updateOrderStatus,
  fetchMasterMenu,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  socketUrl,
  statusIndex,
  buildFoodFormData,
  emptyNewFood,
  emptyEditFood,
} from '../models/canteenDashboard.model.js'
import { useAuth } from './useAuth.js'

export function useStaffDashboard() {
  const { user } = useAuth()
  // canteen_staff only has Orders access (view/update order status) — no
  // menu/stock/price management. Everyone else (super_admin/admin) lands on
  // Manage Today, matching the existing default.
  const isCanteenStaffOnly = user?.role === 'staff' && user?.staff_role === 'canteen_staff'
  const [tab, setTab] = useState(isCanteenStaffOnly ? 'orders' : 'manage')
  const [orders, setOrders] = useState([])
  const [todayItems, setTodayItems] = useState([])
  const [masterItems, setMasterItems] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [limit] = useState(5)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [publishStatus, setPublishStatus] = useState('')
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Order history. The live "Orders" tab/queue above is
  // deliberately active-only (fetchOrders(..., 'active')); staff previously
  // had no UI path at all to review a completed/cancelled order after it left
  // that queue, even though the backend already supports an unfiltered fetch.
  const [historyOrders, setHistoryOrders] = useState([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all')

  const loadOrders = useCallback(async (targetPage = 1) => {
    try {
      const data = await fetchOrders(targetPage, limit, 'active')
      setOrders(data.orders)
      setTotal(data.total)
      setSelectedOrder((current) => {
        if (!current) return null
        return data.orders.find((order) => order.id === current.id) || null
      })
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to load orders.')
    }
  }, [limit])

  const loadHistory = useCallback(async (targetPage = 1) => {
    try {
      const data = await fetchOrders(targetPage, limit)
      setHistoryOrders(data.orders)
      setHistoryTotal(data.total)
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to load order history.')
    }
  }, [limit])

  const loadMenuConfig = useCallback(async () => {
    try {
      const config = await fetchTodaysMenuConfig()
      setTodayItems(config.items)
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to load menu config.')
    }
  }, [])

  const loadMaster = useCallback(async () => {
    try {
      const items = await fetchMasterMenu()
      setMasterItems(items)
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to load master menu.')
    }
  }, [])

  const refreshDashboard = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([loadOrders(page), loadMenuConfig(), loadMaster(), loadHistory(historyPage)])
    } finally {
      setIsRefreshing(false)
    }
  }, [page, historyPage, loadOrders, loadMenuConfig, loadMaster, loadHistory])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshDashboard()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [page, refreshDashboard])

  useEffect(() => {
    if (tab !== 'history') return undefined
    const timer = window.setTimeout(() => {
      void loadHistory(historyPage)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [tab, historyPage, loadHistory])

  useEffect(() => {
    // withCredentials — join-staff-room now authenticates via the same
    // HttpOnly session cookie every REST call already sends (see server.js/
    // realtime/socketAuth.js); without this, the handshake carries no
    // credential and the join is silently rejected. Same option
    // useMatchChat.js already uses for the identical reason.
    const socket = io(socketUrl, { withCredentials: true })
    let hasConnectedBefore = false

    // Socket.IO drops room membership on disconnect and never
    // auto-rejoins an app-level room on its own reconnect; re-emit the join
    // every time, and resync orders/menu via HTTP on any reconnect (not the
    // first connect) so a status change published while the staff dashboard
    // was disconnected (ground WiFi drop, etc.) is never silently missed.
    socket.on('connect', () => {
      socket.emit('join-staff-room')
      if (hasConnectedBefore) {
        loadOrders(page)
        loadMenuConfig()
      }
      hasConnectedBefore = true
    })

    socket.on('order-created', () => loadOrders(page))
    socket.on('order-status-updated', () => loadOrders(page))
    socket.on('order-completed', () => loadOrders(page))
    socket.on('menu-updated', () => loadMenuConfig())
    return () => socket.disconnect()
  }, [page, loadOrders, loadMenuConfig])

  const handleStatusUpdate = async (order, nextStatus) => {
    try {
      const updated = await updateOrderStatus(order.id, nextStatus)
      setSelectedOrder(['Completed', 'Cancelled'].includes(updated.status) ? null : updated)
      await loadOrders(page)
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to update order.')
    }
  }

  const handleToggleAvailability = (itemId) => {
    setTodayItems((prev) => prev.map((item) => item.id === itemId ? { ...item, available: !item.available } : item))
    setPublishStatus('')
  }

  const handleAddToToday = (masterItem) => {
    setTodayItems((prev) => {
      if (prev.find((i) => i.id === masterItem.id)) return prev
      return [...prev, { id: masterItem.id, name: masterItem.name, available: true, dailyPrice: masterItem.price || masterItem.dailyPrice || 0 }]
    })
    setPublishStatus('')
  }

  const [newFood, setNewFood] = useState(emptyNewFood)
  const [previewImage, setPreviewImage] = useState('')
  const [editingItem, setEditingItem] = useState(null)
  const [editFood, setEditFood] = useState(emptyEditFood)
  const [editPreviewImage, setEditPreviewImage] = useState('')

  const handleCreateFood = async () => {
    setError('')
    try {
      await createMenuItem(buildFoodFormData(newFood))
      setNewFood(emptyNewFood)
      setPreviewImage('')
      await loadMaster()
      setTab('all')
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to create food item.')
    }
  }

  const startEditFood = (item) => {
    setEditingItem(item)
    setEditFood({
      id: item.id,
      name: item.name,
      category: item.category,
      description: item.description,
      price: item.price,
      image: item.image || '',
      imageFile: null,
    })
    setEditPreviewImage(item.image || '')
  }

  const closeEditModal = () => {
    setEditingItem(null)
    setEditFood(emptyEditFood)
    setEditPreviewImage('')
  }

  const handleUpdateFood = async () => {
    if (!editingItem) return
    setError('')
    try {
      await updateMenuItem(editFood.id, buildFoodFormData(editFood))
      await loadMaster()
      await loadMenuConfig()
      closeEditModal()
      setTab('all')
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to update food item.')
    }
  }

  const handleDeleteFood = async (item) => {
    if (!window.confirm(`Delete "${item.name}" from the menu? This cannot be undone.`)) {
      return
    }

    setError('')
    try {
      await deleteMenuItem(item.id)
      setTodayItems((prev) => prev.filter((entry) => entry.id !== item.id))
      if (editingItem?.id === item.id) {
        closeEditModal()
      }
      await loadMaster()
      await loadMenuConfig()
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to delete food item.')
    }
  }

  const handlePublishMenu = async () => {
    setError('')
    setPublishStatus('Saving...')
    try {
      await publishTodaysMenu({ items: todayItems })
      setPublishStatus('Today’s menu saved successfully.')
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to publish today’s menu.')
      setPublishStatus('')
    }
  }

  const handleNewFoodImageChange = (file) => {
    setNewFood((prev) => ({ ...prev, imageFile: file }))
    if (file) {
      setPreviewImage(URL.createObjectURL(file))
    }
  }

  const handleEditFoodImageChange = (file) => {
    setEditFood((prev) => ({ ...prev, imageFile: file }))
    if (file) {
      setEditPreviewImage(URL.createObjectURL(file))
    }
  }

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit])
  const historyTotalPages = useMemo(() => Math.max(1, Math.ceil(historyTotal / limit)), [historyTotal, limit])

  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()

    return orders.filter((order) => {
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter
      const matchesSearch = !term || [order.id, order.customerName, order.seatId].some((value) => String(value || '').toLowerCase().includes(term))
      return matchesStatus && matchesSearch
    })
  }, [orders, searchTerm, statusFilter])

  const filteredHistoryOrders = useMemo(() => {
    if (historyStatusFilter === 'all') return historyOrders
    return historyOrders.filter((order) => order.status === historyStatusFilter)
  }, [historyOrders, historyStatusFilter])

  return {
    isCanteenStaffOnly,
    tab,
    setTab,
    orders,
    todayItems,
    masterItems,
    page,
    setPage,
    total,
    limit,
    selectedOrder,
    setSelectedOrder,
    publishStatus,
    error,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    isRefreshing,
    refreshDashboard,
    statusIndex,
    handleStatusUpdate,
    handleToggleAvailability,
    handleAddToToday,
    newFood,
    setNewFood,
    previewImage,
    editingItem,
    editFood,
    setEditFood,
    editPreviewImage,
    handleCreateFood,
    startEditFood,
    closeEditModal,
    handleUpdateFood,
    handleDeleteFood,
    handlePublishMenu,
    handleNewFoodImageChange,
    handleEditFoodImageChange,
    totalPages,
    filteredOrders,
    historyPage,
    setHistoryPage,
    historyTotalPages,
    historyStatusFilter,
    setHistoryStatusFilter,
    filteredHistoryOrders,
  }
}
