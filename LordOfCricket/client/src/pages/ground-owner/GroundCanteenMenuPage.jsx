import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { fetchGroundProfile } from '../../services/groundsApi.js'
import {
  fetchCanteenMenuItems,
  createCanteenMenuItem,
  updateCanteenMenuItem,
  deleteCanteenMenuItem,
} from '../../services/groundOwnerApi.js'
import GroundNavTabs from '../../components/ground-owner/GroundNavTabs.jsx'

export default function GroundCanteenMenuPage() {
  const { publicGroundId } = useParams()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const [canteen, setCanteen] = useState(null)
  const [menuItems, setMenuItems] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [selectedImage, setSelectedImage] = useState(null)

  const [formData, setFormData] = useState({
    name: '',
    category: '',
    description: '',
    price: '',
    stock: '',
  })

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
          return fetchCanteenMenuItems(publicGroundId, firstCanteen.publicCanteenId).then(setMenuItems)
        }
      })
      .catch((err) => setError(err.response?.data?.message || err.response?.data?.error || 'Failed to load menu items'))
      .finally(() => setLoading(false))
  }, [publicGroundId])

  useEffect(() => {
    loadData()
  }, [loadData])

  function resetForm() {
    setFormData({ name: '', category: '', description: '', price: '', stock: '' })
    setSelectedImage(null)
    setEditingId(null)
  }

  function handleEdit(item) {
    setFormData({
      name: item.name,
      category: item.category,
      description: item.description || '',
      price: item.price,
      stock: item.stock,
    })
    setEditingId(item.id)
    setShowForm(true)
  }

  async function handleSave() {
    if (!formData.name || !formData.category || !formData.price) {
      setError('Name, category, and price are required.')
      return
    }

    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      const payload = {
        name: formData.name,
        category: formData.category,
        description: formData.description,
        price: Number(formData.price),
        stock: Number(formData.stock) || 0,
        image: selectedImage,
      }

      if (editingId) {
        await updateCanteenMenuItem(publicGroundId, canteen.publicCanteenId, editingId, payload)
        setSuccess('Menu item updated successfully.')
      } else {
        await createCanteenMenuItem(publicGroundId, canteen.publicCanteenId, payload)
        setSuccess('Menu item created successfully.')
      }

      await loadData()
      resetForm()
      setShowForm(false)
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to save menu item')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(itemId) {
    if (!confirm('Are you sure you want to delete this menu item?')) return

    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      await deleteCanteenMenuItem(publicGroundId, canteen.publicCanteenId, itemId)
      setSuccess('Menu item deleted successfully.')
      await loadData()
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to delete menu item')
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
        <h1 className="text-3xl font-bold mb-2">Menu Management</h1>
        <p className="text-slate-400 mb-6">Create and manage your canteen menu items</p>

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

        <div className="mt-6 flex justify-between items-center">
          <h2 className="text-xl font-semibold">Menu Items ({menuItems.length})</h2>
          {!showForm && (
            <button
              onClick={() => { resetForm(); setShowForm(true) }}
              className="px-4 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-500 transition"
            >
              + Add Menu Item
            </button>
          )}
        </div>

        {showForm && (
          <div className="mt-6 bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold mb-4">
              {editingId ? 'Edit Menu Item' : 'Create Menu Item'}
            </h3>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Chicken Biryani"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Category *
                  </label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="e.g., Biryani, Snacks, Beverages"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe your menu item..."
                  rows="3"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Price (₹) *
                  </label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Stock
                  </label>
                  <input
                    type="number"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    placeholder="0"
                    min="0"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Image (JPEG/PNG/WEBP, max 10MB)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setSelectedImage(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:border-green-500"
                />
                {selectedImage && (
                  <p className="text-sm text-green-400 mt-1">✓ {selectedImage.name}</p>
                )}
              </div>
            </div>

            <div className="mt-6 flex gap-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {saving ? 'Saving...' : 'Save Item'}
              </button>
              <button
                onClick={() => { resetForm(); setShowForm(false) }}
                disabled={saving}
                className="px-6 py-2 bg-slate-700 text-white rounded font-medium hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="mt-8 space-y-4">
          {menuItems.length === 0 ? (
            <div className="p-6 bg-slate-800 rounded-lg border border-slate-700 text-center">
              <p className="text-slate-400">No menu items yet. Create your first item!</p>
            </div>
          ) : (
            menuItems.map((item) => (
              <div key={item.id} className="bg-slate-800 rounded-lg p-4 border border-slate-700 flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{item.name}</h3>
                  <p className="text-sm text-slate-400">{item.category}</p>
                  {item.description && (
                    <p className="text-sm text-slate-300 mt-1">{item.description}</p>
                  )}
                  <div className="mt-2 flex gap-6 text-sm">
                    <span>₹{Number(item.price).toFixed(2)}</span>
                    <span className="text-slate-400">Stock: {item.stock}</span>
                    {item.imageUrl && (
                      <span className="text-green-400">Has image</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleEdit(item)}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-500 disabled:opacity-50 transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={saving}
                    className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-500 disabled:opacity-50 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        </div>
        </div>
      </div>
    </div>
  )
}
