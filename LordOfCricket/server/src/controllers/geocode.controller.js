import { geocodeLandmark, GeocodingError } from '../services/geocoding.service.js'

const MAX_QUERY_LENGTH = 150

export async function searchLandmark(req, res, next) {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    if (!q) return res.status(400).json({ error: 'q is required.' })
    if (q.length > MAX_QUERY_LENGTH) return res.status(400).json({ error: `q must be ${MAX_QUERY_LENGTH} characters or fewer.` })

    const location = await geocodeLandmark(q)
    res.json(location)
  } catch (err) {
    if (err instanceof GeocodingError) {
      return res.status(err.statusCode).json({ error: err.message })
    }
    next(err)
  }
}
