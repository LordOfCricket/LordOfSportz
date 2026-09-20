import AdminLayout from '../../components/admin/AdminLayout.jsx'
import Button from '../../components/ui/Button.jsx'
import AmenityCatalogGrid from '../../components/common/AmenityCatalogGrid.jsx'
import { useAdminGroundRegistrations } from '../../hooks/useAdminGroundRegistrations.js'

const STATUS_LABEL = {
  PENDING: 'Pending',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  MORE_INFORMATION_REQUESTED: 'More Info Requested',
  MORE_INFORMATION_REQUIRED: 'More Info Requested',
}

// §7 — filter tabs use the EXISTING backend status values, only relabeled.
const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'MORE_INFORMATION_REQUIRED', label: 'Changes Required' },
  { value: 'REJECTED', label: 'Rejected' },
]

// Only PENDING/UNDER_REVIEW requests are still awaiting a decision — every
// other status has already been decided, so Approve/Reject/Request Info
// are hidden rather than offered on an already-closed request.
const ACTIONABLE_STATUSES = new Set(['PENDING', 'UNDER_REVIEW'])

function formatRequestAddress(request) {
  return [request.addressLine, request.city, request.state, request.postalCode, request.country].filter(Boolean).join(', ')
}

// Ground Registration feature — the review queue now shows what's actually
// being approved (photos/amenities/terms), not just the text fields, so
// this is a real review rather than a rubber stamp.
function RequestReviewDetails({ request, amenityCatalog }) {
  const featured = request.photos?.filter((p) => p.isFeatured) || []
  const gallery = request.photos?.filter((p) => !p.isFeatured) || []
  const amenities = (request.amenityKeys || []).map((key) => amenityCatalog.find((a) => a.key === key)).filter(Boolean)

  return (
    <div className="mt-3 space-y-4 border-t border-white/10 pt-3">
      {request.groundDescription && <p className="text-sm text-slate-300">{request.groundDescription}</p>}

      {featured.length > 0 && (
        <div>
          <span className="text-xs font-bold tracking-wide text-emerald-300 uppercase">Featured Photos ({featured.length}/6)</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {featured.map((p, i) => (
              <img key={i} src={p.imageUrl} alt={`Featured ${i + 1}`} className="h-16 w-24 rounded-lg object-cover" />
            ))}
          </div>
        </div>
      )}

      {gallery.length > 0 && (
        <div>
          <span className="text-xs font-bold tracking-wide text-emerald-300 uppercase">Gallery ({gallery.length})</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {gallery.map((p, i) => (
              <img key={i} src={p.imageUrl} alt={`Gallery ${i + 1}`} className="h-16 w-24 rounded-lg object-cover" />
            ))}
          </div>
        </div>
      )}

      {amenities.length > 0 && (
        <div>
          <span className="text-xs font-bold tracking-wide text-emerald-300 uppercase">Amenities</span>
          <div className="mt-2">
            <AmenityCatalogGrid amenities={amenities} />
          </div>
        </div>
      )}

      <div>
        <span className="text-xs font-bold tracking-wide text-emerald-300 uppercase">Location</span>
        <p className="mt-1 text-sm text-slate-300">{formatRequestAddress(request)}</p>
        {request.latitude != null && request.longitude != null && (
          <p className="text-xs text-slate-500">
            {Number(request.latitude).toFixed(5)}, {Number(request.longitude).toFixed(5)}
          </p>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Terms agreed: {request.termsAgreedAt ? new Date(request.termsAgreedAt).toLocaleString() : 'not recorded'}
      </p>
    </div>
  )
}

// Mirrors AdminUmpireRequestsPage.jsx's layout — the review queue for Ground
// Owner requests (POST /grounds, POST /ground-owner-requests) instead of
// umpire requests. Phase 4: approving here is what creates the ground and
// grants GROUND_OWNER membership (previously granted at submission time,
// before any review — the bug this phase fixes).
export default function AdminGroundRegistrationsPage() {
  const {
    requests,
    statusFilter,
    setStatusFilter,
    amenityCatalog,
    loading,
    error,
    handleApprove,
    handleReject,
    handleRequestInformation,
  } = useAdminGroundRegistrations()

  return (
    <AdminLayout title="Ground Requests" subtitle="Review requests to register a new ground on LOC.">
      <div className="mb-5 flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setStatusFilter(tab.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              statusFilter === tab.value ? 'bg-emerald-500 text-emerald-950' : 'border border-white/15 text-slate-300 hover:bg-white/10'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-[32px] border border-white/15 bg-slate-900/45 p-6 shadow-2xl backdrop-blur-2xl">
        {loading ? (
          <p className="text-slate-300">Loading registrations…</p>
        ) : requests.length === 0 ? (
          <p className="rounded-2xl bg-white/10 p-5 text-slate-300">No ground requests match this filter.</p>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <article key={request.publicRequestId} className="rounded-[24px] border border-white/10 bg-white/10 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <span className="text-xs font-semibold uppercase tracking-wide text-emerald-300">{STATUS_LABEL[request.status] || request.status}</span>
                    <h3 className="text-lg font-semibold text-white">{request.groundName}</h3>
                    <p className="font-mono text-xs text-slate-500">{request.publicRequestId}</p>
                    <p className="text-sm text-slate-300">{formatRequestAddress(request)}</p>
                    <p className="text-sm text-slate-400">{[request.groundPhone, request.groundEmail].filter(Boolean).join(' · ')}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Applicant: {request.applicantName} ({[request.applicantEmail, request.applicantPhone].filter(Boolean).join(' / ')})
                    </p>
                    {request.createdAt && (
                      <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">Submitted {new Date(request.createdAt).toLocaleDateString()}</p>
                    )}
                  </div>
                  {ACTIONABLE_STATUSES.has(request.status) && (
                    <div className="flex shrink-0 flex-wrap gap-3">
                      <Button onClick={() => handleApprove(request)}>Approve</Button>
                      <Button className="bg-amber-600" onClick={() => handleRequestInformation(request)}>
                        Request Info
                      </Button>
                      <Button className="bg-red-600" onClick={() => handleReject(request)}>
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
                <RequestReviewDetails request={request} amenityCatalog={amenityCatalog} />
              </article>
            ))}
          </div>
        )}

        {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
      </div>
    </AdminLayout>
  )
}
