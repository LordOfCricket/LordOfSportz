import { Trash2, Upload, Pencil, EyeOff, Eye, X } from 'lucide-react'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { useAdminSponsors } from '../../hooks/useAdminSponsors.js'

function EditSponsorForm({ editForm, setEditForm, submitting, error, onSave, onCancel }) {
  return (
    <form onSubmit={onSave} className="mt-3 flex flex-col gap-3 border-t border-white/10 pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-300">Name</label>
          <input
            type="text"
            value={editForm.name}
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            className="rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-300">Website (optional)</label>
          <input
            type="url"
            value={editForm.websiteUrl}
            onChange={(e) => setEditForm((f) => ({ ...f, websiteUrl: e.target.value }))}
            placeholder="https://example.com"
            className="rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-slate-300">About / description</label>
        <textarea
          value={editForm.description}
          onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
          rows={2}
          placeholder="Official sports partner of LOC"
          className="rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-slate-300">Replace logo (optional)</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setEditForm((f) => ({ ...f, file: e.target.files[0] || null }))}
          className="rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white file:mr-3 file:rounded-md file:border-0 file:bg-emerald-500 file:px-3 file:py-1.5 file:text-emerald-950"
        />
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

export default function AdminSponsorsPage() {
  const {
    partners,
    loading,
    listError,
    file,
    setFile,
    name,
    setName,
    websiteUrl,
    setWebsiteUrl,
    description,
    setDescription,
    submitting,
    error,
    handleUpload,
    editingId,
    editForm,
    setEditForm,
    editSubmitting,
    editError,
    startEdit,
    cancelEdit,
    saveEdit,
    toggleActive,
    handleDelete,
  } = useAdminSponsors()

  return (
    <AdminLayout title="Sponsors" subtitle="Shown on the LOC homepage — only active sponsors are publicly visible.">
      <div className="flex flex-col gap-8">
        <form
          onSubmit={handleUpload}
          className="flex flex-col gap-4 rounded-[28px] border border-white/15 bg-slate-900/45 p-6 shadow-2xl backdrop-blur-2xl"
        >
          <h2 className="text-lg font-semibold text-white">Add Sponsor</h2>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-300">Logo</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files[0])}
              className="rounded-lg border border-white/15 bg-slate-950/50 px-3 py-2 text-sm text-white file:mr-4 file:rounded-md file:border-0 file:bg-emerald-500 file:px-3 file:py-1.5 file:text-emerald-950"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-300">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. ABC Sports"
                className="rounded-lg border border-white/15 bg-slate-950/50 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-300">Website (optional)</label>
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://example.com"
                className="rounded-lg border border-white/15 bg-slate-950/50 px-3 py-2 text-sm text-white placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-300">About / description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Official sports partner of LOC"
              className="rounded-lg border border-white/15 bg-slate-950/50 px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
          </div>

          {error && <p className="text-sm text-rose-300">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !file || !name}
            className="inline-flex w-fit items-center justify-center gap-2 rounded-full bg-linear-to-r from-emerald-400 to-emerald-600 px-6 py-3 text-sm font-semibold text-emerald-950 shadow-md shadow-emerald-500/30 transition-all hover:shadow-emerald-400/50 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {submitting ? 'Uploading…' : 'Add Sponsor'}
          </button>
        </form>

        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-white">Current Sponsors {loading ? '' : `(${partners.length})`}</h2>
          {listError && <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{listError}</p>}

          {loading ? (
            <p className="text-slate-300">Loading…</p>
          ) : partners.length === 0 ? (
            <p className="rounded-2xl bg-white/10 p-5 text-slate-300">No sponsors yet — add one above.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {partners.map((partner) => (
                <div key={partner.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      <img src={partner.logo_url} alt={partner.name} className="h-14 w-20 shrink-0 rounded-lg bg-white/5 object-contain p-1" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold text-white">{partner.name}</p>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${partner.is_active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-slate-400'}`}>
                            {partner.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        {partner.description && <p className="truncate text-sm text-slate-400">{partner.description}</p>}
                        {partner.website_url && <p className="truncate text-xs text-slate-500">{partner.website_url}</p>}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => (editingId === partner.id ? cancelEdit() : startEdit(partner))}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(partner)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/30 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/10"
                      >
                        {partner.is_active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {partner.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(partner)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-red-400/30 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>

                  {editingId === partner.id && (
                    <EditSponsorForm
                      editForm={editForm}
                      setEditForm={setEditForm}
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
