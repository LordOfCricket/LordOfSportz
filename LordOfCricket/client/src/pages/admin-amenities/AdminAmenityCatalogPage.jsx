import { Trash2, Pencil, EyeOff, Eye, X, Plus } from 'lucide-react'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import AmenityIcon from '../../components/common/AmenityIcon.jsx'
import { useAdminAmenityCatalog } from '../../hooks/useAdminAmenityCatalog.js'

function IconSelect({ value, onChange, iconAllowList, required }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-white/15 bg-slate-950/50 px-3 py-2 text-sm text-white"
      required={required}
    >
      <option value="" disabled>
        Choose an icon…
      </option>
      {iconAllowList.map((icon) => (
        <option key={icon} value={icon}>
          {icon}
        </option>
      ))}
    </select>
  )
}

function EditAmenityForm({ editForm, setEditForm, iconAllowList, submitting, error, onSave, onCancel }) {
  return (
    <form onSubmit={onSave} className="mt-3 flex flex-col gap-3 border-t border-white/10 pt-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5 sm:col-span-1">
          <label className="text-xs font-medium text-slate-300">Name</label>
          <input
            type="text"
            value={editForm.name}
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            className="rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-1">
          <label className="text-xs font-medium text-slate-300">Icon</label>
          <IconSelect value={editForm.icon} onChange={(icon) => setEditForm((f) => ({ ...f, icon }))} iconAllowList={iconAllowList} required />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-1">
          <label className="text-xs font-medium text-slate-300">Display order</label>
          <input
            type="number"
            value={editForm.displayOrder}
            onChange={(e) => setEditForm((f) => ({ ...f, displayOrder: e.target.value }))}
            className="rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white"
          />
        </div>
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </button>
      </div>
    </form>
  )
}

// Amenities Master (Super Admin CMS) — this is a NEW page, distinct from
// the orphaned/unrouted admin-amenities/AdminAmenitiesPage.jsx in this same
// folder, which manages a different, legacy, per-ground-photo `amenities`
// table. This page manages amenity_catalog: the icon-driven master list
// Ground Owners pick from (AmenityPicker.jsx) and public ground pages
// render (AmenityCatalogGrid.jsx) — see docs/schema.sql's own comment on
// why these are two separate tables.
export default function AdminAmenityCatalogPage() {
  const {
    amenities,
    iconAllowList,
    loading,
    listError,
    form,
    setForm,
    submitting,
    error,
    handleCreate,
    editingKey,
    editForm,
    setEditForm,
    editSubmitting,
    editError,
    startEdit,
    cancelEdit,
    saveEdit,
    toggleActive,
    handleDelete,
  } = useAdminAmenityCatalog()

  return (
    <AdminLayout title="Amenities" subtitle="The master catalog Ground Owners pick from — not specific to any one ground.">
      <div className="flex flex-col gap-8">
        <form
          onSubmit={handleCreate}
          className="flex flex-col gap-4 rounded-[28px] border border-white/15 bg-slate-900/45 p-6 shadow-2xl backdrop-blur-2xl"
        >
          <h2 className="text-lg font-semibold text-white">Add Amenity</h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2 sm:col-span-1">
              <label className="text-sm font-medium text-slate-300">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Practice Nets"
                className="rounded-lg border border-white/15 bg-slate-950/50 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                required
              />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-1">
              <label className="text-sm font-medium text-slate-300">Icon</label>
              <IconSelect value={form.icon} onChange={(icon) => setForm((f) => ({ ...f, icon }))} iconAllowList={iconAllowList} required />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-1">
              <label className="text-sm font-medium text-slate-300">Display order</label>
              <input
                type="number"
                value={form.displayOrder}
                onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))}
                className="rounded-lg border border-white/15 bg-slate-950/50 px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          {form.icon && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              Preview: <AmenityIcon name={form.icon} className="h-5 w-5 text-emerald-300" /> {form.name || 'Amenity name'}
            </div>
          )}

          {error && <p className="text-sm text-rose-300">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !form.name || !form.icon}
            className="inline-flex w-fit items-center justify-center gap-2 rounded-full bg-linear-to-r from-emerald-400 to-emerald-600 px-6 py-3 text-sm font-semibold text-emerald-950 shadow-md shadow-emerald-500/30 transition-all hover:shadow-emerald-400/50 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {submitting ? 'Adding…' : 'Add Amenity'}
          </button>
        </form>

        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-white">Master Catalog {loading ? '' : `(${amenities.length})`}</h2>
          {listError && <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{listError}</p>}

          {loading ? (
            <p className="text-slate-300">Loading…</p>
          ) : amenities.length === 0 ? (
            <p className="rounded-2xl bg-white/10 p-5 text-slate-300">No amenities yet — add one above.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {amenities.map((amenity) => (
                <div key={amenity.key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-300">
                        <AmenityIcon name={amenity.icon} className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold text-white">{amenity.name}</p>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${amenity.is_active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-slate-400'}`}>
                            {amenity.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className="truncate text-xs text-slate-500">
                          {amenity.key} · order {amenity.display_order}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => (editingKey === amenity.key ? cancelEdit() : startEdit(amenity))}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(amenity)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/30 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/10"
                      >
                        {amenity.is_active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {amenity.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(amenity)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-red-400/30 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>

                  {editingKey === amenity.key && (
                    <EditAmenityForm
                      editForm={editForm}
                      setEditForm={setEditForm}
                      iconAllowList={iconAllowList}
                      submitting={editSubmitting}
                      error={editError}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
