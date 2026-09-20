import { getIndiaFeaturedMatch } from '../services/cricapi.service.js'

export async function getFeaturedIndiaMatch(req, res, next) {
  try {
    const match = await getIndiaFeaturedMatch()
    res.json(match)
  } catch (err) {
    next(err)
  }
}
