import { useCallback, useState } from 'react'
import { searchGroundsByCity, fetchNearbyGrounds } from '../services/groundsApi.js'
import { DEFAULT_PAGE_SIZE } from '../models/groundDiscovery.model.js'

/** One hook for both discovery modes ("SELECT YOUR CITY" and "📍 FIND
 * GROUNDS NEAR ME"), replacing the earlier separate useGroundsByCity.js/
 * useNearbyGrounds.js — the two were >80% identical (fetch/pagination/
 * loadMore/error handling), differing only in which endpoint they called.
 *
 * Search is submit-driven (`search({...})`), not auto-fetched on a
 * dependency-change effect — every setState call happens inside an event
 * handler (the caller's onSubmit/button-click), never inside a useEffect
 * body, which sidesteps the react-hooks/set-state-in-effect lint rule
 * entirely (same reasoning as the original useGroundsByCity.js). */
export function useGroundSearch() {
  const [query, setQuery] = useState(null) // { mode: 'city'|'nearby', ...params } once searched
  const [grounds, setGrounds] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)

  const fetchForQuery = useCallback((q, page) => {
    if (q.mode === 'city') return searchGroundsByCity({ city: q.city, page, limit: DEFAULT_PAGE_SIZE })
    return fetchNearbyGrounds({ latitude: q.latitude, longitude: q.longitude, radiusKm: q.radiusKm, page, limit: DEFAULT_PAGE_SIZE })
  }, [])

  const fetchPage = useCallback(
    (q, page, { append }) => {
      const setBusy = append ? setLoadingMore : setLoading
      setBusy(true)
      setError(null)
      fetchForQuery(q, page)
        .then((data) => {
          setGrounds((prev) => (append ? [...prev, ...data.grounds] : data.grounds))
          setPagination(data.pagination)
        })
        .catch((err) => {
          setError(err.response?.data?.error || "Couldn't load grounds.")
        })
        .finally(() => setBusy(false))
    },
    [fetchForQuery],
  )

  const searchByCity = useCallback(
    (city) => {
      const trimmed = city.trim()
      if (!trimmed) return
      const q = { mode: 'city', city: trimmed }
      setQuery(q)
      fetchPage(q, 1, { append: false })
    },
    [fetchPage],
  )

  const searchNearby = useCallback(
    (latitude, longitude, radiusKm) => {
      const q = { mode: 'nearby', latitude, longitude, radiusKm }
      setQuery(q)
      fetchPage(q, 1, { append: false })
    },
    [fetchPage],
  )

  const loadMore = useCallback(() => {
    if (!query || !pagination || pagination.page >= pagination.totalPages) return
    fetchPage(query, pagination.page + 1, { append: true })
  }, [query, pagination, fetchPage])

  const retry = useCallback(() => {
    if (!query) return
    const nextPage = grounds.length === 0 ? 1 : (pagination?.page ?? 0) + 1
    fetchPage(query, nextPage, { append: nextPage > 1 })
  }, [query, grounds.length, pagination, fetchPage])

  const reset = useCallback(() => {
    setQuery(null)
    setGrounds([])
    setPagination(null)
    setError(null)
  }, [])

  const hasMore = Boolean(pagination && pagination.page < pagination.totalPages)
  const searched = query !== null

  return {
    mode: query?.mode ?? null,
    city: query?.city ?? null,
    radiusKm: query?.radiusKm ?? null,
    searched,
    grounds,
    pagination,
    loading,
    loadingMore,
    error,
    searchByCity,
    searchNearby,
    loadMore,
    hasMore,
    retry,
    reset,
  }
}
