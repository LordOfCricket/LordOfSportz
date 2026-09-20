import { Link } from 'react-router-dom'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import Button from '../../components/ui/Button.jsx'
import { useAdminAllGrounds } from '../../hooks/useAdminAllGrounds.js'

const STATUS_STYLE = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-300',
  SUSPENDED: 'bg-red-500/15 text-red-300',
  DRAFT: 'bg-amber-500/15 text-amber-300',
}

// SUPER_ADMIN Identity & Secure Provisioning feature — §11. Every ground
// regardless of status (unlike public discovery, which is ACTIVE-only) —
// admin-only visibility of a pending/suspended ground never leaks it
// publicly, since findAllGroundsForAdmin is a distinct, admin-gated query.
export default function AllGroundsPage() {
  const { grounds, loading, error, actioningId, handleSuspend, handleReactivate } = useAdminAllGrounds()

  return (
    <AdminLayout title="All Grounds" subtitle="Every ground registered on LOC, regardless of status.">
      <div className="rounded-[32px] border border-white/15 bg-slate-900/45 p-6 shadow-2xl backdrop-blur-2xl">
        {loading ? (
          <p className="text-slate-300">Loading grounds…</p>
        ) : grounds.length === 0 ? (
          <p className="rounded-2xl bg-white/10 p-5 text-slate-300">No grounds yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-slate-400 uppercase">
                  <th className="py-2 pr-4">Ground</th>
                  <th className="py-2 pr-4">Owner</th>
                  <th className="py-2 pr-4">Location</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {grounds.map((g) => (
                  <tr key={g.publicGroundId} className="border-b border-white/5">
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-white">{g.name}</p>
                      <p className="font-mono text-xs text-slate-500">{g.publicGroundId}</p>
                    </td>
                    <td className="py-3 pr-4 text-slate-300">{g.ownerName || '—'}</td>
                    <td className="py-3 pr-4 text-slate-300">{[g.city, g.state].filter(Boolean).join(', ') || '—'}</td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[g.status] || 'bg-white/10 text-slate-300'}`}>{g.status}</span>
                    </td>
                    <td className="py-3 pr-4 text-slate-400">{new Date(g.createdAt).toLocaleDateString()}</td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-2">
                        <Link to={`/grounds/${g.publicGroundId}`} target="_blank" rel="noreferrer" className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10">
                          View
                        </Link>
                        {g.status === 'ACTIVE' && (
                          <Button
                            className="h-auto bg-red-600 px-3 py-1.5 text-xs"
                            disabled={actioningId === g.publicGroundId}
                            onClick={() => handleSuspend(g)}
                          >
                            {actioningId === g.publicGroundId ? 'Suspending…' : 'Suspend'}
                          </Button>
                        )}
                        {g.status === 'SUSPENDED' && (
                          <Button
                            className="h-auto px-3 py-1.5 text-xs"
                            disabled={actioningId === g.publicGroundId}
                            onClick={() => handleReactivate(g)}
                          >
                            {actioningId === g.publicGroundId ? 'Reactivating…' : 'Reactivate'}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
      </div>
    </AdminLayout>
  )
}
