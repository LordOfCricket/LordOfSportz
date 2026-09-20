import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchGroundProfile } from '../../services/groundsApi.js'
import { fetchCanteenMenuItems, fetchCanteenOrders, updateCanteenStatus } from '../../services/groundOwnerApi.js'
import GroundNavTabs from '../../components/ground-owner/GroundNavTabs.jsx'

export default function GroundCanteenPage() {
  const { publicGroundId } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [canteen, setCanteen] = useState(null)
  const [menuItemsCount, setMenuItemsCount] = useState(0)
  const [todaysOrdersCount, setTodaysOrdersCount] = useState(0)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [statusError, setStatusError] = useState(null)
  const [statusSuccess, setStatusSuccess] = useState(false)

  // Phase 24 — Ground Owner self-service canteen activate/deactivate.
  // Deactivating stops NEW customer orders (enforced server-side,
  // unchanged Phase 17.2 check in canteenOrder.controller.js#createOrder)
  // — existing menu items and existing orders are never touched by this.
  async function handleToggleStatus() {
    if (!canteen || statusUpdating) return
    setStatusUpdating(true)
    setStatusError(null)
    setStatusSuccess(false)
    try {
      const updated = await updateCanteenStatus(publicGroundId, canteen.publicCanteenId, !canteen.isActive)
      setCanteen((prev) => ({ ...prev, isActive: updated.isActive }))
      setStatusSuccess(true)
      setTimeout(() => setStatusSuccess(false), 4000)
    } catch (err) {
      setStatusError(err.response?.data?.error || 'Failed to update canteen status.')
    } finally {
      setStatusUpdating(false)
    }
  }

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

          return Promise.all([
            fetchCanteenMenuItems(publicGroundId, firstCanteen.publicCanteenId),
            fetchCanteenOrders(publicGroundId, firstCanteen.publicCanteenId, { limit: 100 }),
          ]).then(([menuItems, ordersData]) => {
            setMenuItemsCount(menuItems.length || 0)
            const today = new Date().toDateString()
            const todayOrders = ordersData.orders?.filter(o => new Date(o.createdAt).toDateString() === today) || []
            setTodaysOrdersCount(todayOrders.length)
          })
        }
      })
      .catch((err) => setError(err.message || 'Failed to load canteen data'))
      .finally(() => setLoading(false))
  }, [publicGroundId])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-slate-700 rounded w-1/3"></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="h-24 bg-slate-700 rounded"></div>
              <div className="h-24 bg-slate-700 rounded"></div>
              <div className="h-24 bg-slate-700 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!canteen) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Canteen Management</h1>
          <p className="text-slate-400 mb-6">Manage your cricket ground's food & refreshments</p>

          <div className="lg:flex lg:items-start lg:gap-6">
          <GroundNavTabs />

          <div className="min-w-0 flex-1">
          <div className="mt-6 p-6 bg-amber-900/30 border border-amber-500/50 rounded text-amber-200">
            No canteen found for this ground. Please contact support.
          </div>
          </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Canteen Management</h1>
        <p className="text-slate-400 mb-6">Manage your cricket ground's food & refreshments</p>

        <div className="lg:flex lg:items-start lg:gap-6">
        <GroundNavTabs />

        <div className="min-w-0 flex-1">

        {error && (
          <div className="mt-6 p-4 bg-red-900/30 border border-red-500/50 rounded text-red-200">
            {error}
          </div>
        )}

        {statusSuccess && (
          <div className="mt-6 p-3 bg-emerald-900/30 border border-emerald-500/50 rounded text-emerald-200 text-sm">
            Canteen {canteen.isActive ? 'activated' : 'deactivated'} successfully.
          </div>
        )}

        {statusError && (
          <div className="mt-6 p-3 bg-red-900/30 border border-red-500/50 rounded text-red-200 text-sm">
            {statusError}
          </div>
        )}

        <div className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h2 className="text-xl font-semibold">
              {canteen.name}{' '}
              <span className={canteen.isActive ? 'text-emerald-400' : 'text-amber-400'}>
                ({canteen.isActive ? 'Active' : 'Inactive'})
              </span>
            </h2>
            <button
              onClick={handleToggleStatus}
              disabled={statusUpdating}
              className={`px-4 py-2 rounded font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${
                canteen.isActive
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-green-600 hover:bg-green-500 text-white'
              }`}
            >
              {statusUpdating ? 'Updating…' : canteen.isActive ? 'Deactivate Canteen' : 'Activate Canteen'}
            </button>
          </div>
          {!canteen.isActive && (
            <p className="mb-4 text-sm text-amber-300">
              This canteen is not accepting new orders. Existing orders and menu data are unaffected.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Menu Items Stat */}
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <div className="text-slate-400 text-sm font-medium mb-2">Menu Items</div>
              <div className="text-4xl font-bold text-green-400 mb-4">{menuItemsCount}</div>
              <button
                onClick={() => navigate(`/ground-owner/grounds/${publicGroundId}/canteen/menu`)}
                className="w-full px-4 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-500 transition"
              >
                Manage Menu
              </button>
            </div>

            {/* Today's Orders Stat */}
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <div className="text-slate-400 text-sm font-medium mb-2">Today's Orders</div>
              <div className="text-4xl font-bold text-blue-400 mb-4">{todaysOrdersCount}</div>
              <button
                onClick={() => navigate(`/ground-owner/grounds/${publicGroundId}/canteen/orders`)}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-500 transition"
              >
                View Orders
              </button>
            </div>

            {/* Today's Menu Stat */}
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <div className="text-slate-400 text-sm font-medium mb-2">Today's Menu</div>
              <div className="text-3xl font-bold text-purple-400 mb-4">Publish</div>
              <button
                onClick={() => navigate(`/ground-owner/grounds/${publicGroundId}/canteen/today`)}
                className="w-full px-4 py-2 bg-purple-600 text-white rounded font-medium hover:bg-purple-500 transition"
              >
                Set Today's Menu
              </button>
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
            <div className="space-y-2 text-slate-300 text-sm">
              <p>✓ Create menu items with images and descriptions</p>
              <p>✓ Set daily pricing and stock availability</p>
              <p>✓ Track customer orders in real-time</p>
              <p>✓ Manage order status from Pending to Completed</p>
            </div>
          </div>
        </div>
        </div>
        </div>
      </div>
    </div>
  )
}
