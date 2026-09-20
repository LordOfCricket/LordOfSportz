import { useCallback, useEffect, useState } from 'react'
import { fetchAllGrounds } from '../services/groundsApi.js'
import { DEFAULT_PAGE_SIZE } from '../models/groundDiscovery.model.js'

/** GET /api/grounds — "grounds already registered on LOC," fetched once on
 * mount (no search input needed, unlike useGroundSearch.js). `loading` is
 * DERIVED (`pagination === null && error === null`), matching useGround.js's
 * convention, so the initial fetch never needs a synchronous setState at
 * the top of the effect (react-hooks/set-state-in-effect). `loadMore`/
 * `retry` are click handlers, free to set `loadingMore` synchronously.
 *
 * `sort`/`limit` let callers like BookGroundSection.jsx and GroundsPage.jsx
 * reuse this exact hook with their own params instead of writing a second one. */
export function useAllGrounds({ sort, limit = DEFAULT_PAGE_SIZE } = {}) {
  const [grounds, setGrounds] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)

  const fetchPage = useCallback((page, { append }) => {
    fetchAllGrounds({ page, limit, sort })
      .then((data) => {
        setGrounds((prev) => (append ? [...prev, ...data.grounds] : data.grounds))
        setPagination(data.pagination)
        setError(null)
      })
      .catch((err) => {
        setError(err.response?.data?.error || "Couldn't load registered grounds.")
      })
      .finally(() => setLoadingMore(false))
  }, [limit, sort])

  useEffect(() => {
    fetchPage(1, { append: false })
  }, [fetchPage])

  const loadMore = useCallback(() => {
    if (!pagination || pagination.page >= pagination.totalPages) return
    setLoadingMore(true)
    fetchPage(pagination.page + 1, { append: true })
  }, [pagination, fetchPage])

  const retry = useCallback(() => {
    const nextPage = grounds.length === 0 ? 1 : (pagination?.page ?? 0) + 1
    setError(null)
    if (nextPage > 1) setLoadingMore(true)
    fetchPage(nextPage, { append: nextPage > 1 })
  }, [grounds.length, pagination, fetchPage])

  const hasMore = Boolean(pagination && pagination.page < pagination.totalPages)
  const loading = pagination === null && error === null

  return { grounds, pagination, loading, loadingMore, error, loadMore, hasMore, retry }
}
