import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Star, ThumbsUp, ThumbsDown } from 'lucide-react'
import GroundOwnerLayout from '../../components/ground-owner/GroundOwnerLayout.jsx'
import GroundNavTabs from '../../components/ground-owner/GroundNavTabs.jsx'
import { StatsErrorState, StatsLoadingGrid, StatsEmptyState } from '../../components/stats/StatsStates.jsx'
import StatTile from '../../components/stats/StatTile.jsx'
import { useGroundReviews } from '../../hooks/useGroundReviews.js'

function formatDate(iso) {
  return new Date(iso).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
}

function Stars({ rating }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-4 w-4 ${i < rating ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} aria-hidden="true" />
      ))}
    </span>
  )
}

function ReviewCard({ review }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-5 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <Stars rating={review.rating} />
        <span className="text-xs text-slate-400">{formatDate(review.submittedAt)}</span>
      </div>

      {/* Phase 13 — anonymous by design (no reviewer identity — see
          matchFeedback.model.js#findGroundReviews). Only the two distinct
          feedback fields the submission form itself captures. */}
      {(review.commentLiked || review.commentImprove) && (
        <div className="mt-3 space-y-2 text-sm">
          {review.commentLiked && (
            <p className="flex items-start gap-2 text-slate-200">
              <ThumbsUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
              <span>{review.commentLiked}</span>
            </p>
          )}
          {review.commentImprove && (
            <p className="flex items-start gap-2 text-slate-200">
              <ThumbsDown className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
              <span>{review.commentImprove}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function GroundReviewsPage() {
  const { publicGroundId } = useParams()
  const [page, setPage] = useState(1)
  const { reviews, pagination, loading, error, refresh } = useGroundReviews(publicGroundId, page)

  const summary = reviews && reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length)
    : null

  return (
    <GroundOwnerLayout>
      <div className="lg:flex lg:items-start lg:gap-6">
        <GroundNavTabs />

        <div className="min-w-0 flex-1">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">Reviews</h1>
        <p className="mt-2 text-slate-400">What players are saying about your ground, from post-match feedback.</p>
      </div>

      {loading && <StatsLoadingGrid tiles={2} />}
      {!loading && error && <StatsErrorState message={error} onRetry={refresh} />}

      {!loading && !error && pagination && pagination.total === 0 && (
        <StatsEmptyState label="No reviews yet — they will appear here after players submit post-match feedback for this ground" suffix="" />
      )}

      {!loading && !error && pagination && pagination.total > 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Total Reviews" value={pagination.total} emphasis />
            <StatTile label="This Page Avg." value={summary !== null ? summary.toFixed(1) : '—'} />
            <StatTile label="Page" value={`${pagination.page} / ${pagination.totalPages}`} />
          </div>

          <div className="space-y-3">
            {reviews.map((review, i) => (
              <ReviewCard key={`${review.submittedAt}-${i}`} review={review} />
            ))}
          </div>

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page <= 1}
                className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-slate-400">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={pagination.page >= pagination.totalPages}
                className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
        </div>
      </div>
    </GroundOwnerLayout>
  )
}
