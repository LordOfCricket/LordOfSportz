import { Link } from 'react-router-dom'
import { ClipboardCheck, Images, UserPlus, MapPinned, Trophy, Users, ShieldCheck, ClipboardList } from 'lucide-react'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { useAuth } from '../../hooks/useAuth.js'
import { useAdminDashboard } from '../../hooks/useAdminDashboard.js'
import BackButton from '../../components/common/BackButton.jsx'

// Final Whole-Project Audit — Canteen is a ground-scoped operational
// function (owner/canteen-staff only); Super Admin is a platform
// administrator, not a ground operator, so it must never get a "Manage
// Canteen" shortcut here (previously flagged in the Super Admin audit,
// fixed now per this audit's explicit role-boundary requirement).
const QUICK_ACTIONS = [
  { to: '/admin/umpire-requests', icon: ClipboardCheck, title: 'Umpire Requests', description: 'Review and approve umpire requests.', cta: 'View Requests', allow: ['super_admin'] },
  { to: '/admin/photos-hub', icon: Images, title: 'Edit Photos', description: 'Manage homepage, amenities and gallery images.', cta: 'Manage Photos', allow: ['super_admin'] },
  { to: '/admin/staff/new', icon: UserPlus, title: 'Create Staff', description: 'Create Admin, Canteen Staff, or Super Admin accounts.', cta: 'Create Staff', allow: ['super_admin'] },
]

function StatCard({ icon: Icon, label, value, to }) {
  const content = (
    <div className="flex items-center gap-4 rounded-[24px] border border-white/10 bg-white/10 p-5 shadow-lg shadow-slate-950/20 backdrop-blur-sm transition-colors hover:bg-white/15">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300">
        <Icon size={22} />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
        <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">{label}</p>
      </div>
    </div>
  )
  return to ? <Link to={to}>{content}</Link> : content
}

const STATUS_LABEL = { PENDING: 'Pending Review', UNDER_REVIEW: 'Under Review' }

// SUPER_ADMIN Identity & Secure Provisioning feature — real overview data
// (§6), not the old static-nav-cards-only page. Quick Actions below are
// kept (they link to genuinely real, existing admin capabilities — not
// meaningless placeholders), now secondary to the actual dashboard.
export default function AdminDashboardPage() {
  const { user } = useAuth()
  const { stats, loading, error } = useAdminDashboard()
  const actions = QUICK_ACTIONS.filter((card) => card.allow.includes(user?.staff_role))

  return (
    <AdminLayout title="LOC Admin Control Center" subtitle={`Signed in as ${user?.name} — ${user?.staff_role?.replace('_', ' ')}`}>
      <BackButton fallback="/" className="mb-4" />

      {error && <p className="mb-4 text-sm text-rose-300">{error}</p>}
      {loading ? (
        <p className="text-slate-300">Loading dashboard…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard icon={MapPinned} label="Total Grounds" value={stats?.totalGrounds} to="/admin/all-grounds" />
            <StatCard icon={ClipboardList} label="Pending Ground Requests" value={stats?.pendingGroundRequests} to="/admin/ground-registrations" />
            <StatCard icon={Trophy} label="Active Grounds" value={stats?.activeGrounds} to="/admin/all-grounds" />
            <StatCard icon={ShieldCheck} label="Ground Owners" value={stats?.groundOwners} to="/admin/ground-owners" />
            <StatCard icon={Users} label="Players" value={stats?.players} to="/admin/players" />
            <StatCard icon={Users} label="Umpires" value={stats?.umpires} to="/admin/umpires" />
          </div>

          {stats?.recentPendingRequests?.length > 0 && (
            <div className="mt-8 rounded-[28px] border border-white/10 bg-white/5 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Pending Ground Requests</h2>
                <Link to="/admin/ground-registrations" className="text-sm font-semibold text-emerald-300 hover:text-emerald-200">
                  View all
                </Link>
              </div>
              <div className="space-y-3">
                {stats.recentPendingRequests.map((r) => (
                  <div key={r.publicRequestId} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-white">{r.groundName}</p>
                      <p className="font-mono text-xs text-slate-400">{r.publicRequestId}</p>
                      <p className="text-xs text-slate-400">
                        Owner: {r.applicantName} · {[r.city, r.state].filter(Boolean).join(', ')}
                      </p>
                      <p className="text-xs text-slate-500">Submitted {new Date(r.submittedAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300">{STATUS_LABEL[r.status] || r.status}</span>
                      <Link
                        to="/admin/ground-registrations"
                        className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-bold text-emerald-950 hover:bg-emerald-400"
                      >
                        Review
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <h2 className="mt-10 mb-4 text-lg font-bold text-white">Quick Actions</h2>
      <div className="grid gap-6 sm:grid-cols-2">
        {actions.map(({ to, icon: Icon, title, description, cta }) => (
          <article key={to} className="flex flex-col justify-between rounded-[28px] border border-white/10 bg-white/10 p-6 shadow-lg shadow-slate-950/20 backdrop-blur-sm">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-500/20 text-green-300">
                <Icon size={24} />
              </div>
              <h3 className="mt-4 text-xl font-bold text-white">{title}</h3>
              <p className="mt-2 text-sm text-slate-300">{description}</p>
            </div>
            <Link
              to={to}
              className="mt-6 inline-flex w-fit items-center justify-center rounded-2xl bg-gradient-to-r from-green-700 via-green-500 to-lime-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-green-900/40 transition-all hover:scale-[1.02] hover:brightness-110"
            >
              {cta}
            </Link>
          </article>
        ))}
      </div>
    </AdminLayout>
  )
}
