import { getTopUmpires } from '../services/umpireLeaderboard.service.js'

export async function listTopUmpires(req, res, next) {
  try {
    const limit = Number(req.query.limit)
    const offset = Number(req.query.offset)
    const result = await getTopUmpires({
      limit: Number.isFinite(limit) ? limit : undefined,
      offset: Number.isFinite(offset) ? offset : undefined,
    })
    res.json(result)
  } catch (err) {
    next(err)
  }
}
