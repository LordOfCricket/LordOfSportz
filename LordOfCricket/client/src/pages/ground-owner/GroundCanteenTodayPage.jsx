import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { fetchGroundProfile } from '../../services/groundsApi.js'
import {
  fetchCanteenMenuItems,
  fetchTodaysMenuConfig,
  publishTodaysMenu,
} from '../../services/groundOwnerApi.js'
import GroundNavTabs from '../../components/ground-owner/GroundNavTabs.jsx'

export default function GroundCanteenTodayPage() {
  const { publicGroundId } = useParams()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const [canteen, setCanteen] = useState(null)
  const [menuItems, setMenuItems] = useState([])
  const [selectedItems, setSelectedItems] = useState([])

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
            fetchTodaysMenuConfig(publicGroundId, firstCanteen.publicCanteenId),
          ]).then(([items, todayConfig]) => {
            setMenuItems(items)

            // Phase 11 audit fix — getTodaysMenuConfig actually responds with
            // { publishedAt, items: [{ id, dailyPrice, available, stock, ... }] }
            // (canteenMenu.controller.js), not { todayMenuItems: [{ menuItemId }] };
            // this always evaluated false, so a page reload never showed the
            // ground's already-published today's-menu selection.
            if (todayConfig.items) {
              setSelectedItems(todayConfig.items.map(item => ({
                menuItemId: item.id,
                dailyPrice: item.dailyPrice || item.price,
                available: item.available,
                stock: item.stock,
              })))
            }
          })
        }
      })
      .catch((err) => setError(err.response?.data?.message || err.response?.data?.error || 'Failed to load today\'s menu'))
      .finally(() => setLoading(false))
  }, [publicGroundId])

  useEffect(() => {
    loadData()
  }, [loadData])

  function toggleItemSelection(menuItemId) {
    const isSelected = selectedItems.some(item => item.menuItemId === menuItemId)
    if (isSelected) {
      setSelectedItems(selectedItems.filter(item => item.menuItemId !== menuItemId))
    } else {
      const menuItem = menuItems.find(item => item.id === menuItemId)
      setSelectedItems([
        ...selectedItems,
        {
          menuItemId,
          dailyPrice: menuItem.price,
          available: true,
          stock: menuItem.stock,
          sortOrder: selectedItems.length,
        },
      ])
    }
  }

  function updateItemConfig(menuItemId, field, value) {
    setSelectedItems(selectedItems.map(item =>
      item.menuItemId === menuItemId ? { ...item, [field]: value } : item
    ))
  }

  async function handlePublish() {
    if (selectedItems.length === 0) {
      setError('Please select at least one item for today\'s menu.')
      return
    }

    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      // Phase 11 audit fix — the backend (canteenMenu.controller.js's
      // updateTodaysMenu + canteenTodayMenu.model.js's replaceTodayMenu)
      // expects { items: [{ id, dailyPrice, available, stock }] }, not
      // { todayMenuItems: [{ menuItemId, ... }] }. The mismatched wrapper
      // key made every publish 400 outright; even past that, the mismatched
      // inner `id` field would have silently published zero items (each
      // one skipped for having no recognized id) instead of erroring. Only
      // the outgoing shape changes here — selectedItems' own `menuItemId`
      // naming is left alone since toggleItemSelection/updateItemConfig/
      // the JSX below all key off it.
      const payload = {
        items: selectedItems.map((item) => ({
          id: item.menuItemId,
          dailyPrice: Number(item.dailyPrice),
          available: item.available,
          stock: Number(item.stock) || 0,
        })),
      }

      await publishTodaysMenu(publicGroundId, canteen.publicCanteenId, payload)
      setSuccess('Today\'s menu published successfully!')
      await loadData()
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to publish today\'s menu')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-slate-700 rounded w-1/3"></div>
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-slate-700 rounded"></div>
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
        <h1 className="text-3xl font-bold mb-2">Today's Menu</h1>
        <p className="text-slate-400 mb-6">Select and configure items available today</p>

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

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Available Items */}
          <div className="lg:col-span-2">
            <h2 className="text-xl font-semibold mb-4">Available Menu Items</h2>

            {menuItems.length === 0 ? (
              <div className="p-6 bg-slate-800 rounded-lg border border-slate-700 text-center">
                <p className="text-slate-400">No menu items available. Create menu items first.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {menuItems.map((item) => {
                  const isSelected = selectedItems.some(si => si.menuItemId === item.id)
                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-lg border cursor-pointer transition ${
                        isSelected
                          ? 'bg-green-900/20 border-green-500'
                          : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                      }`}
                      onClick={() => toggleItemSelection(item.id)}
                    >
                      <div className="flex items-start gap-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="mt-1 w-5 h-5 rounded cursor-pointer"
                        />
                        <div className="flex-1">
                          <h3 className="font-semibold">{item.name}</h3>
                          <p className="text-sm text-slate-400">{item.category}</p>
                          {item.description && (
                            <p className="text-sm text-slate-300 mt-1">{item.description}</p>
                          )}
                          <p className="text-sm mt-2">₹{Number(item.price).toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Selected Items Configuration */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Today's Configuration</h2>

            {selectedItems.length === 0 ? (
              <div className="p-6 bg-slate-800 rounded-lg border border-slate-700 text-center">
                <p className="text-slate-400 text-sm">Select items to configure</p>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedItems.map((item) => {
                  const menuItem = menuItems.find(mi => mi.id === item.menuItemId)
                  return (
                    <div key={item.menuItemId} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                      <h3 className="font-semibold text-sm mb-3">{menuItem?.name}</h3>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">
                            Daily Price (₹)
                          </label>
                          <input
                            type="number"
                            value={item.dailyPrice}
                            onChange={(e) => updateItemConfig(item.menuItemId, 'dailyPrice', e.target.value)}
                            step="0.01"
                            min="0"
                            className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-green-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">
                            Stock
                          </label>
                          <input
                            type="number"
                            value={item.stock}
                            onChange={(e) => updateItemConfig(item.menuItemId, 'stock', e.target.value)}
                            min="0"
                            className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-green-500"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={item.available}
                            onChange={(e) => updateItemConfig(item.menuItemId, 'available', e.target.checked)}
                            className="w-4 h-4 rounded cursor-pointer"
                          />
                          <label className="text-xs font-medium text-slate-300 cursor-pointer">
                            Available
                          </label>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <button
              onClick={handlePublish}
              disabled={saving || selectedItems.length === 0}
              className="w-full mt-6 px-4 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {saving ? 'Publishing...' : 'Publish Today\'s Menu'}
            </button>
          </div>
        </div>
        </div>
        </div>
      </div>
    </div>
  )
}
