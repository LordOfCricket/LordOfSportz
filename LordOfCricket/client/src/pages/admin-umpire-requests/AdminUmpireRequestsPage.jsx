import AdminLayout from '../../components/admin/AdminLayout.jsx'
import Button from '../../components/ui/Button.jsx'
import { useAdminUmpireRequests } from '../../hooks/useAdminUmpireRequests.js'

export default function AdminUmpireRequestsPage() {
  const { requests, loading, error, handleDecide } = useAdminUmpireRequests()

  return (
    <AdminLayout title="Umpire Requests" subtitle="Review and approve pending umpire requests.">
      <div className="rounded-[32px] border border-white/15 bg-slate-900/45 p-6 shadow-2xl backdrop-blur-2xl">
        {loading ? (
          <p className="text-slate-300">Loading requests…</p>
        ) : requests.length === 0 ? (
          <p className="rounded-2xl bg-white/10 p-5 text-slate-300">No pending umpire requests.</p>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <article
                key={request.id}
                className="flex flex-col gap-4 rounded-[24px] border border-white/10 bg-white/10 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <h3 className="text-lg font-semibold text-white">{request.name}</h3>
                  <p className="text-sm text-slate-300">{request.email}</p>
                  {request.requested_at && (
                    <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                      Requested {new Date(request.requested_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex gap-3">
                  <Button onClick={() => handleDecide(request, 'approved')}>Approve</Button>
                  <Button className="bg-red-600" onClick={() => handleDecide(request, 'rejected')}>
                    Reject
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}

        {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
      </div>
    </AdminLayout>
  )
}
