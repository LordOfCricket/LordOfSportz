import { useEffect, useState } from 'react'
import { fetchPublicTeams } from '../services/publicTeamApi.js'

/** Same derived-loading / request-race-safe pattern as usePublicMatches.js:
 * loading is derived by comparing the current request's params
 * key against the params key of the last COMPLETED fetch, so setState is
 * never called synchronously inside the effect body, and a slow, now-stale
 * search response can never overwrite a faster newer one. */
export function usePublicTeams({ search, limit, offset }) {
  const [state, setState] = useState({ result: null, error: null, paramsKey: null })
  const paramsKey = JSON.stringify({ search, limit, offset })
  const loading = state.paramsKey !== paramsKey

  useEffect(() => {
    let ignore = false
    fetchPublicTeams({ search, limit, offset })
      .then((data) => {
        if (ignore) return
        setState({ result: data, error: null, paramsKey })
      })
      .catch((err) => {
        if (ignore) return
        setState({ result: null, error: err.response?.data?.message || "Couldn't load teams.", paramsKey })
      })
    return () => {
      ignore = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paramsKey is derived from exactly these same values
  }, [search, limit, offset])

  return { result: state.result, loading, error: loading ? null : state.error }
}
