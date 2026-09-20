import { useCallback, useEffect, useState } from 'react'
import { fetchAllGroundsForUmpire, fetchNearbyGroundsForUmpire, fetchGroundsByCityForUmpire, applyForUmpireSlot } from '../services/umpireSelfApi.js'
import { applyErrorMessage } from '../models/umpireDashboard.model.js'

const PAGE_SIZE = 20
const ALL_QUERY = { mode: 'all' }

// "Grounds for Umpire" opens showing every ground with an upcoming match
// (mode: 'all') — no search step required first. City/nearby search are
// REFINEMENTS on top of that default, not a gate blocking it (LocationSelector
// renders as a compact filter bar, never a full-page picker the umpire has
// to get past before seeing anything). Every setState call still happens
// inside an event handler or the one deferred mount effect (never
// synchronously inside an effect body), same convention as every other data
// hook in this codebase.
export function useUmpireGroundDiscovery() {
  const [query, setQuery] = useState(ALL_QUERY)
  const [grounds, setGrounds] = useState([])
  const [pagination, setPagination] = useState(null)
  const [anyGroundsExist, setAnyGroundsExist] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [applyingMatchId, setApplyingMatchId] = useState(null)
  const [applyResults, setApplyResults] = useState({})

  const fetchForQuery = useCallback((q, page) => {
    if (q.mode === 'city') return fetchGroundsByCityForUmpire({ city: q.city, page, limit: PAGE_SIZE })
    if (q.mode === 'nearby') return fetchNearbyGroundsForUmpire({ latitude: q.latitude, longitude: q.longitude, radiusKm: q.radiusKm, page, limit: PAGE_SIZE })
    return fetchAllGroundsForUmpire({ page, limit: PAGE_SIZE })
  }, [])

  const fetchPage = useCallback(
    (q, page, { append }) => {
      const setBusy = append ? setLoadingMore : setLoading
      setBusy(true)
      setError(null)
      return fetchForQuery(q, page)
        .then((data) => {
          setGrounds((prev) => (append ? [...prev, ...data.grounds] : data.grounds))
          setPagination(data.pagination)
          setAnyGroundsExist(data.anyGroundsExist)
        })
        .catch((err) => {
          setError(err.response?.data?.error || "Couldn't load umpiring opportunities.")
        })
        .finally(() => setBusy(false))
    },
    [fetchForQuery],
  )

  // Loads the default "all grounds" view once, on mount.
  useEffect(() => {
    const timer = window.setTimeout(() => fetchPage(ALL_QUERY, 1, { append: false }), 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const browseAll = useCallback(() => {
    setQuery(ALL_QUERY)
    fetchPage(ALL_QUERY, 1, { append: false })
  }, [fetchPage])

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
    const nextPage = grounds.length === 0 ? 1 : (pagination?.page ?? 0) + 1
    fetchPage(query, nextPage, { append: nextPage > 1 })
  }, [query, grounds.length, pagination, fetchPage])

  // Refetches every already-loaded page from page 1 so a match's real
  // filledSlots/currentUserAssigned (which could belong to any of the
  // loaded grounds, not just the first page) come back correct — matches
  // useAvailableMatches.js's "always reload from the backend, never patch
  // local state" contract.
  const refetchAll = useCallback(() => {
    if (!pagination) return Promise.resolve()
    const pagesLoaded = pagination.page
    setLoading(true)
    return fetchForQuery(query, 1)
      .then(async (first) => {
        let all = first.grounds
        for (let p = 2; p <= pagesLoaded; p++) {
          const next = await fetchForQuery(query, p)
          all = [...all, ...next.grounds]
        }
        setGrounds(all)
        setPagination((prev) => ({ ...prev, page: pagesLoaded }))
        setAnyGroundsExist(first.anyGroundsExist)
      })
      .catch((err) => {
        setError(err.response?.data?.error || "Couldn't refresh umpiring opportunities.")
      })
      .finally(() => setLoading(false))
  }, [query, pagination, fetchForQuery])

  const apply = useCallback(
    async (matchId) => {
      setApplyingMatchId(matchId)
      setApplyResults((prev) => ({ ...prev, [matchId]: null }))
      try {
        await applyForUmpireSlot(matchId)
        setApplyResults((prev) => ({ ...prev, [matchId]: { type: 'success', text: "You're assigned to umpire this match." } }))
        await refetchAll()
      } catch (err) {
        const code = err.response?.data?.code
        const text = applyErrorMessage(code, err.response?.data?.message || err.response?.data?.error)
        setApplyResults((prev) => ({ ...prev, [matchId]: { type: 'error', text } }))
        if (code === 'NO_SLOT_AVAILABLE' || code === 'ALREADY_ASSIGNED' || code === 'MATCH_NOT_ELIGIBLE') {
          await refetchAll()
        }
      } finally {
        setApplyingMatchId(null)
      }
    },
    [refetchAll],
  )

  const hasMore = Boolean(pagination && pagination.page < pagination.totalPages)

  return {
    mode: query.mode,
    city: query.mode === 'city' ? query.city : null,
    radiusKm: query.mode === 'nearby' ? query.radiusKm : null,
    grounds,
    pagination,
    anyGroundsExist,
    loading,
    loadingMore,
    error,
    searchByCity,
    searchNearby,
    browseAll,
    loadMore,
    hasMore,
    retry,
    applyingMatchId,
    applyResults,
    apply,
  }
}
