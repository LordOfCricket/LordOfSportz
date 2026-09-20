import { Link } from 'react-router-dom'
import { UserPlus, ShieldCheck, ShieldAlert } from 'lucide-react'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { useAdminSettings } from '../../hooks/useAdminSettings.js'

const STAFF_ROLE_LABEL = { super_admin: 'Super Admin', admin: 'Admin', canteen_staff: 'Canteen Staff' }

// SUPER_ADMIN Identity & Secure Provisioning feature — §17 "Admin
// Management". Every Super Admin has an individually attributable account
// here — no shared credentials, so this list itself answers "which Super
// Admin performed this action?" (paired with Audit Logs for the "when"/
// "what"). Deletion is deliberately not offered here — no destructive
// account removal exists for staff accounts anywhere in this codebase yet;
// suspend/deactivate would be the safer primitive if this need arises.
export default function AdminSettingsPage() {
  const { staff, loading, error } = useAdminSettings()

  return (
    <AdminLayout title="Admin Settings" subtitle="Every platform staff account — Super Admins, Admins, and Canteen Staff.">
      <div className="mb-6 flex justify-end">
        <Link
          to="/admin/staff/new"
          className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-green-700 via-green-500 to-lime-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-green-900/40 hover:brightness-110"
        >
          <UserPlus className="h-4 w-4" />
          Create Staff
        </Link>
      </div>

      <div className="rounded-[32px] border border-white/15 bg-slate-900/45 p-6 shadow-2xl backdrop-blur-2xl">
        {error && <p className="mb-4 text-sm text-rose-300">{error}</p>}
        {loading ? (
          <p className="text-slate-300">Loading admin accounts…</p>
        ) : staff.length === 0 ? (
          <p className="rounded-2xl bg-white/10 p-5 text-slate-300">No staff accounts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-slate-400 uppercase">
                  <th className="py-2 pr-4">Admin ID</th>
                  <th className="py-2 pr-4">Name / Username</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">MFA</th>
                  <th className="py-2 pr-4">Last Login</th>
                  <th className="py-2 pr-4">Created</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-b border-white/5">
                    <td className="py-3 pr-4 font-mono text-xs text-slate-300">{s.staff_id || '—'}</td>
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-white">{s.name}</p>
                      {s.username && <p className="text-xs text-slate-500">@{s.username}</p>}
                    </td>
                    <td className="py-3 pr-4 text-slate-300">{s.email}</td>
                    <td className="py-3 pr-4 text-slate-300">{STAFF_ROLE_LABEL[s.staff_role] || s.staff_role}</td>
                    <td className="py-3 pr-4">
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">{s.status}</span>
                      {s.force_password_change && (
                        <span className="ml-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-300">Password change pending</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {s.mfaEnabled ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300">
                          <ShieldCheck className="h-3.5 w-3.5" /> Enrolled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300">
                          <ShieldAlert className="h-3.5 w-3.5" /> Not enrolled
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-slate-400">{s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString() : 'Never'}</td>
                    <td className="py-3 pr-4 text-slate-400">{new Date(s.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
