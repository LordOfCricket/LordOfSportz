import { getCache, setCache } from '../utils/cache.js'
import { logger } from '../utils/logger.js'

// Landmark search (Grounds page — "give a landmark, sort grounds around
// it"). OpenStreetMap Nominatim: free, no API key/signup, no paid geocoding
// service added. Their usage policy requires an identifying User-Agent and
// asks for max ~1 request/second, no heavy/cached-elsewhere-avoidable
// traffic — the cache below exists specifically to honor that (same
// getCache/setCache TTL cache cricapi.service.js already uses for a
// different external API), not just as a performance nicety.
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'LordOfCricket-LOC/1.0 (cricket ground discovery; github.com)'
const CACHE_TTL_SECONDS = 60 * 60 * 24 // 24h — a landmark's coordinates don't change
const REQUEST_TIMEOUT_MS = 8000

export class GeocodingError extends Error {
  constructor(message, statusCode) {
    super(message)
    this.name = 'GeocodingError'
    this.statusCode = statusCode
  }
}

function cacheKey(query) {
  return `geocode:${query.trim().toLowerCase()}`
}

/** Resolves a free-text landmark/address to real coordinates. Throws
 * GeocodingError(404) when nothing matches, GeocodingError(502) when
 * Nominatim itself is unreachable/erroring — the controller maps both to
 * honest client-facing responses, never silently substituting a guessed
 * location. */
export async function geocodeLandmark(query) {
  const key = cacheKey(query)
  const cached = getCache(key)
  if (cached !== undefined) return cached

  const url = `${NOMINATIM_BASE}?format=json&limit=1&q=${encodeURIComponent(query)}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res
  try {
    res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: controller.signal })
  } catch (err) {
    logger.warn('Nominatim request failed', { query, error: err.message })
    throw new GeocodingError("Couldn't reach the location search service. Try again shortly.", 502)
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    logger.warn('Nominatim returned a non-OK status', { query, status: res.status })
    throw new GeocodingError("Couldn't reach the location search service. Try again shortly.", 502)
  }

  const results = await res.json()
  if (!Array.isArray(results) || results.length === 0) {
    throw new GeocodingError(`No location found for "${query}".`, 404)
  }

  const top = results[0]
  const latitude = Number(top.lat)
  const longitude = Number(top.lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new GeocodingError(`No location found for "${query}".`, 404)
  }

  const resolved = { latitude, longitude, displayName: top.display_name || query }
  setCache(key, resolved, CACHE_TTL_SECONDS)
  return resolved
}
