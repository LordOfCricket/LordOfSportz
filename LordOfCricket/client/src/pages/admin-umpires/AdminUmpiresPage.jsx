import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { useAdminUmpires } from '../../hooks/useAdminUmpires.js'

export default function AdminUmpiresPage() {
  const { umpires, loading, error } = useAdminUmpires()

  return (
    <AdminLayout title="Umpires" subtitle="Every registered umpire on LOC.">
      <div className="rounded-[32px] border border-white/15 bg-slate-900/45 p-6 shadow-2xl backdrop-blur-2xl">
        {error && <p className="mb-4 text-sm text-rose-300">{error}</p>}
        {loading ? (
          <p className="text-slate-300">Loading umpires…</p>
        ) : umpires.length === 0 ? (
          <p className="rounded-2xl bg-white/10 p-5 text-slate-300">No umpires yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-slate-400 uppercase">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Contact</th>
                  <th className="py-2 pr-4">Account Status</th>
                  <th className="py-2 pr-4">Umpire Request</th>
                  <th className="py-2 pr-4">Joined</th>
                </tr>
              </thead>
              <tbody>
                {umpires.map((u) => (
                  <tr key={u.userId} className="border-b border-white/5">
                    <td className="py-3 pr-4 font-semibold text-white">{u.name}</td>
                    <td className="py-3 pr-4 text-slate-300">{[u.email, u.phone].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="py-3 pr-4">
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">{u.status}</span>
                    </td>
                    <td className="py-3 pr-4 text-slate-300">{u.umpireRequestStatus || '—'}</td>
                    <td className="py-3 pr-4 text-slate-400">{new Date(u.createdAt).toLocaleDateString()}</td>
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
