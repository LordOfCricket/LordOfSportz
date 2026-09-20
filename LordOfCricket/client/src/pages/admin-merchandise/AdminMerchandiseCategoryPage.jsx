import { NavLink, useParams, Link } from 'react-router-dom'
import { Trash2, Upload, Pencil, X, Star } from 'lucide-react'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import {
  useAdminMerchandise,
  MERCHANDISE_STATUSES,
  STATUS_LABELS,
  SORT_OPTIONS,
} from '../../hooks/useAdminMerchandise.js'
import { MERCHANDISE_CATEGORIES, categoryBySlug } from '../../lib/merchandiseCategories.js'
import { formatPrice } from '../../lib/money.js'

const INPUT = 'rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500'
const FILE_INPUT = `${INPUT} file:mr-3 file:rounded-md file:border-0 file:bg-emerald-500 file:px-3 file:py-1.5 file:text-emerald-950`
const money = (v) => formatPrice(v) ?? '—'

function ProductFields({ form, setForm, attributes, requireImage }) {
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const setAttr = (key, value) => setForm((f) => ({ ...f, attributes: { ...f.attributes, [key]: value } }))
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-300">
          Product name *
          <input type="text" value={form.name} onChange={(e) => set({ name: e.target.value })} className={INPUT} required />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-300">
          SKU / product code
          <input type="text" value={form.sku} onChange={(e) => set({ sku: e.target.value })} className={INPUT} />
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-300">
        Description
        <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} rows={2} className={INPUT} />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-300">
          Selling price (₹) *
          <input type="number" min="0" step="0.01" value={form.sellingPrice} onChange={(e) => set({ sellingPrice: e.target.value })} className={INPUT} required />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-300">
          Original price (₹)
          <input type="number" min="0" step="0.01" value={form.originalPrice} onChange={(e) => set({ originalPrice: e.target.value })} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-300">
          Discount price (₹)
          <input type="number" min="0" step="0.01" value={form.discountPrice} onChange={(e) => set({ discountPrice: e.target.value })} className={INPUT} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-300">
          Stock quantity
          <input type="number" min="0" step="1" value={form.stockQuantity} onChange={(e) => set({ stockQuantity: e.target.value })} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-300">
          Display order
          <input type="number" min="0" step="1" value={form.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-300">
          Status
          <select value={form.status} onChange={(e) => set({ status: e.target.value })} className={INPUT}>
            {MERCHANDISE_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </label>
      </div>

      {attributes.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {attributes.map((attr) => (
            <label key={attr.key} className="flex flex-col gap-1.5 text-xs font-medium text-slate-300">
              {attr.label}
              <input
                type="text"
                value={form.attributes?.[attr.key] ?? ''}
                onChange={(e) => setAttr(attr.key, e.target.value)}
                className={INPUT}
              />
            </label>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-xs font-medium text-slate-300">
          <input type="checkbox" checked={form.isFeatured} onChange={(e) => set({ isFeatured: e.target.checked })} />
          Featured product
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-300">
          {requireImage ? 'Product image *' : 'Replace image (optional)'}
          <input type="file" accept="image/*" onChange={(e) => set({ file: e.target.files[0] || null })} className={FILE_INPUT} required={requireImage} />
        </label>
      </div>
    </>
  )
}

export default function AdminMerchandiseCategoryPage() {
  const { categorySlug } = useParams()
  const category = categoryBySlug(categorySlug)

  const merch = useAdminMerchandise(category?.name)
  const {
    products, total, pageSize, page, setPage,
    loading, listError, notice,
    q, setQ, statusFilter, setStatusFilter, sort, setSort,
    addForm, setAddForm, submitting, error, handleAdd,
    editingId, editForm, setEditForm, editSubmitting, editError,
    startEdit, cancelEdit, saveEdit, changeStatus, toggleFeatured, handleDelete,
  } = merch

  if (!category) {
    return (
      <AdminLayout title="Merchandise">
        <p className="rounded-2xl bg-white/10 p-5 text-slate-300">
          Unknown category. <Link to="/admin/merchandise" className="text-emerald-300 underline">Back to Merchandise</Link>
        </p>
      </AdminLayout>
    )
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <AdminLayout title={`Merchandise · ${category.name}`} subtitle="Add, edit, remove and organise products in this category.">
      <div className="mb-6 flex flex-wrap gap-2">
        {MERCHANDISE_CATEGORIES.map((c) => (
          <NavLink
            key={c.slug}
            to={`/admin/merchandise/${c.slug}`}
            className={({ isActive }) =>
              `rounded-full px-4 py-2 text-xs font-semibold transition ${
                isActive ? 'bg-green-600 text-white' : 'border border-white/15 text-slate-200 hover:bg-white/10'
              }`
            }
          >
            {c.icon} {c.name}
          </NavLink>
        ))}
      </div>

      <div className="flex flex-col gap-8">
        <form onSubmit={handleAdd} className="flex flex-col gap-4 rounded-[28px] border border-white/15 bg-slate-900/45 p-6 shadow-2xl backdrop-blur-2xl">
          <h2 className="text-lg font-semibold text-white">Add Product</h2>
          <ProductFields form={addForm} setForm={setAddForm} attributes={category.attributes} requireImage />
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !addForm.file || !addForm.name || !addForm.sellingPrice}
            className="inline-flex w-fit items-center justify-center gap-2 rounded-full bg-linear-to-r from-emerald-400 to-emerald-600 px-6 py-3 text-sm font-semibold text-emerald-950 shadow-md shadow-emerald-500/30 transition-all hover:shadow-emerald-400/50 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {submitting ? 'Uploading…' : 'Add Product'}
          </button>
        </form>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Products {loading ? '' : `(${total})`}</h2>
            <div className="flex flex-wrap gap-2">
              <input
                type="search"
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1) }}
                placeholder="Search name or SKU"
                className={INPUT}
              />
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} className={INPUT}>
                <option value="">All statuses</option>
                {MERCHANDISE_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className={INPUT}>
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {notice && <p className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{notice}</p>}
          {listError && <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{listError}</p>}

          {loading ? (
            <p className="text-slate-300">Loading…</p>
          ) : products.length === 0 ? (
            <p className="rounded-2xl bg-white/10 p-5 text-slate-300">No products in this category yet — add one above.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {products.map((product) => (
                <div key={product.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      <img src={product.imageUrl} alt={product.name} className="h-16 w-16 shrink-0 rounded-lg bg-white/5 object-cover" />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-semibold text-white">
                          {product.name}
                          {product.isFeatured && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                        </p>
                        <p className="truncate text-sm text-slate-400">
                          {product.sku ? `${product.sku} · ` : ''}{money(product.discountPrice ?? product.sellingPrice)}
                          {product.discountPrice != null && <span className="ml-1 text-slate-500 line-through">{money(product.sellingPrice)}</span>}
                          {' · '}Stock {product.stockQuantity} · #{product.sortOrder}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleFeatured(product)}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                          product.isFeatured ? 'border-amber-400/40 text-amber-300' : 'border-white/15 text-slate-200 hover:bg-white/10'
                        }`}
                      >
                        <Star className="h-3.5 w-3.5" />
                        {product.isFeatured ? 'Featured' : 'Feature'}
                      </button>
                      <select
                        value={product.status}
                        onChange={(e) => changeStatus(product, e.target.value)}
                        className="rounded-xl border border-white/15 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        {MERCHANDISE_STATUSES.map((s) => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => (editingId === product.id ? cancelEdit() : startEdit(product))}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(product)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-red-400/30 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>

                  {editingId === product.id && (
                    <form onSubmit={saveEdit} className="mt-3 flex flex-col gap-3 border-t border-white/10 pt-3">
                      <ProductFields form={editForm} setForm={setEditForm} attributes={category.attributes} />
                      {editError && <p className="text-sm text-rose-300">{editError}</p>}
                      <div className="flex gap-2">
                        <button type="submit" disabled={editSubmitting} className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50">
                          {editSubmitting ? 'Saving…' : 'Save Changes'}
                        </button>
                        <button type="button" onClick={cancelEdit} className="inline-flex items-center gap-1 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10">
                          <X className="h-3.5 w-3.5" />
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && totalPages > 1 && (
            <div className="mt-2 flex items-center justify-center gap-3 text-sm text-slate-300">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-white/15 px-3 py-1.5 disabled:opacity-40">Prev</button>
              <span>Page {page} of {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded-lg border border-white/15 px-3 py-1.5 disabled:opacity-40">Next</button>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
