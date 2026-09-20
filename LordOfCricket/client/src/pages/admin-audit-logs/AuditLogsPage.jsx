import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { useAdminAuditLog } from '../../hooks/useAdminAuditLog.js'
import { ACCOUNT_AUDIT_EVENTS } from '../../models/auditLog.model.js'

// SUPER_ADMIN Identity & Secure Provisioning feature — §15. Reuses the
// existing ACCOUNT_AUDIT_EVENTS names as filter options (friendly-labeled),
// no invented taxonomy. metadata is rendered as raw JSON for now — every
// recordEvent() call site across the codebase already never puts plaintext
// passwords/OTPs/tokens/MFA secrets into it, so nothing here needs redaction.
export default function AuditLogsPage() {
  const { events, pagination, loading, error, eventType, setEventType, goToPage } = useAdminAuditLog()

  return (
    <AdminLayout title="Audit Logs" subtitle="Every recorded administrative and security-sensitive action on LOC.">
      <div className="rounded-[32px] border border-white/15 bg-slate-900/45 p-6 shadow-2xl backdrop-blur-2xl">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            Event type
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white focus:border-emerald-400/60 focus:outline-none"
            >
              <option value="">All events</option>
              {ACCOUNT_AUDIT_EVENTS.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="mb-4 text-sm text-rose-300">{error}</p>}
        {loading ? (
          <p className="text-slate-300">Loading audit log…</p>
        ) : events.length === 0 ? (
          <p className="rounded-2xl bg-white/10 p-5 text-slate-300">No events found.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs tracking-wide text-slate-400 uppercase">
                    <th className="py-2 pr-4">Event</th>
                    <th className="py-2 pr-4">Actor</th>
                    <th className="py-2 pr-4">Target</th>
                    <th className="py-2 pr-4">When</th>
                    <th className="py-2 pr-4">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-b border-white/5 align-top">
                      <td className="py-3 pr-4 font-semibold text-white">{e.eventType.replaceAll('_', ' ')}</td>
                      <td className="py-3 pr-4 text-slate-300">{e.actorName || '—'}</td>
                      <td className="py-3 pr-4 text-slate-300">{e.targetName || '—'}</td>
                      <td className="py-3 pr-4 text-slate-400">{new Date(e.createdAt).toLocaleString()}</td>
                      <td className="max-w-xs truncate py-3 pr-4 font-mono text-xs text-slate-500" title={JSON.stringify(e.metadata)}>
                        {e.metadata ? JSON.stringify(e.metadata) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex items-center justify-between text-sm text-slate-300">
              <span>
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} events)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => goToPage(pagination.page - 1)}
                  className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => goToPage(pagination.page + 1)}
                  className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  )
}
