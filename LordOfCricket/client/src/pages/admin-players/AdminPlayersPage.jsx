import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { useAdminPlayers } from '../../hooks/useAdminPlayers.js'

export default function AdminPlayersPage() {
  const { players, loading, error } = useAdminPlayers()

  return (
    <AdminLayout title="Players" subtitle="Every registered team player on LOC.">
      <div className="rounded-[32px] border border-white/15 bg-slate-900/45 p-6 shadow-2xl backdrop-blur-2xl">
        {error && <p className="mb-4 text-sm text-rose-300">{error}</p>}
        {loading ? (
          <p className="text-slate-300">Loading players…</p>
        ) : players.length === 0 ? (
          <p className="rounded-2xl bg-white/10 p-5 text-slate-300">No players yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-slate-400 uppercase">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Contact</th>
                  <th className="py-2 pr-4">City</th>
                  <th className="py-2 pr-4">Jersey #</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Joined</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.userId} className="border-b border-white/5">
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-white">{p.name}</p>
                      {p.publicPlayerId && <p className="font-mono text-xs text-slate-500">{p.publicPlayerId}</p>}
                    </td>
                    <td className="py-3 pr-4 text-slate-300">{[p.email, p.phone].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="py-3 pr-4 text-slate-300">{p.city || '—'}</td>
                    <td className="py-3 pr-4 text-slate-300">{p.jerseyNumber ?? '—'}</td>
                    <td className="py-3 pr-4">
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">{p.status}</span>
                    </td>
                    <td className="py-3 pr-4 text-slate-400">{new Date(p.createdAt).toLocaleDateString()}</td>
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
