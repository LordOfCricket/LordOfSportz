import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { fetchGroundProfile } from '../../services/groundsApi.js'
import {
  fetchCanteenOrders,
  updateCanteenOrderStatus,
} from '../../services/groundOwnerApi.js'
import GroundNavTabs from '../../components/ground-owner/GroundNavTabs.jsx'

const ORDER_STATUSES = ['Pending', 'Accepted', 'Preparing', 'Ready', 'Completed', 'Cancelled']

export default function GroundCanteenOrdersPage() {
  const { publicGroundId } = useParams()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const [canteen, setCanteen] = useState(null)
  const [orders, setOrders] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedOrderId, setSelectedOrderId] = useState(null)

  const loadData = useCallback(() => {
    return Promise.resolve()
      .then(() => {
        setLoading(true)
        setError(null)
        return fetchGroundProfile(publicGroundId)
      })
      .then((groundData) => {
        if (groundData.canteens && groundData.canteens.length > 0) {
          const firstCanteen = groundData.canteens[0]
          setCanteen(firstCanteen)
          return fetchCanteenOrders(publicGroundId, firstCanteen.publicCanteenId, { limit: 100 })
            .then((ordersData) => setOrders(ordersData.orders || []))
        }
      })
      .catch((err) => setError(err.response?.data?.message || err.response?.data?.error || 'Failed to load orders'))
      .finally(() => setLoading(false))
  }, [publicGroundId])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handleStatusUpdate(orderId, newStatus) {
    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      await updateCanteenOrderStatus(publicGroundId, canteen.publicCanteenId, orderId, newStatus)
      setSuccess(`Order status updated to ${newStatus}.`)
      await loadData()
      setSelectedOrderId(null)
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to update order status')
    } finally {
      setSaving(false)
    }
  }

  const filteredOrders = statusFilter === 'all'
    ? orders
    : orders.filter(order => order.status === statusFilter)

  const getStatusColor = (status) => {
    switch (status) {
      case 'Pending': return 'text-yellow-400'
      case 'Accepted': return 'text-blue-400'
      case 'Preparing': return 'text-purple-400'
      case 'Ready': return 'text-green-400'
      case 'Completed': return 'text-green-600'
      case 'Cancelled': return 'text-red-400'
      default: return 'text-slate-400'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-slate-700 rounded w-1/3"></div>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-20 bg-slate-700 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Order Management</h1>
        <p className="text-slate-400 mb-6">Track and manage customer orders</p>

        <div className="lg:flex lg:items-start lg:gap-6">
        <GroundNavTabs />

        <div className="min-w-0 flex-1">

        {error && (
          <div className="mt-6 p-4 bg-red-900/30 border border-red-500/50 rounded text-red-200">
            {error}
          </div>
        )}

        {success && (
          <div className="mt-6 p-4 bg-green-900/30 border border-green-500/50 rounded text-green-200">
            {success}
          </div>
        )}

        <div className="mt-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Orders ({filteredOrders.length})</h2>

            <div className="flex gap-2">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-4 py-2 rounded font-medium transition ${
                  statusFilter === 'all'
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                All
              </button>
              {ORDER_STATUSES.map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-2 rounded text-sm font-medium transition ${
                    statusFilter === status
                      ? 'bg-green-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="p-6 bg-slate-800 rounded-lg border border-slate-700 text-center">
              <p className="text-slate-400">No orders found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-slate-800 rounded-lg p-6 border border-slate-700"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">
                        Order #{order.publicOrderId}
                      </h3>
                      <p className="text-sm text-slate-400 mt-1">
                        {new Date(order.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-semibold ${getStatusColor(order.status)}`}>
                        {order.status}
                      </p>
                      <p className="text-slate-400 text-sm mt-1">
                        ₹{Number(order.total).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 pb-4 border-b border-slate-700">
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Customer</p>
                      <p className="text-sm">{order.customerName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Seat / Table</p>
                      <p className="text-sm">{order.seatId || 'Not specified'}</p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-xs text-slate-400 mb-2">Items:</p>
                    <div className="space-y-1 text-sm">
                      {order.items && order.items.map((item, idx) => (
                        <div key={idx} className="text-slate-300">
                          {item.itemName} ×{item.quantity} @ ₹{Number(item.unitPrice).toFixed(2)}
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedOrderId === order.id ? (
                    <div className="mt-4">
                      <p className="text-xs text-slate-400 mb-2">Change Status:</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {ORDER_STATUSES.filter(s => s !== order.status).map(status => (
                          <button
                            key={status}
                            onClick={() => handleStatusUpdate(order.id, status)}
                            disabled={saving}
                            className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-500 disabled:opacity-50 transition"
                          >
                            → {status}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setSelectedOrderId(null)}
                        className="mt-2 px-3 py-1 bg-slate-700 text-white text-sm rounded hover:bg-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setSelectedOrderId(order.id)}
                      className="mt-4 px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-500 transition"
                    >
                      Update Status
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
        </div>
      </div>
    </div>
  )
}
