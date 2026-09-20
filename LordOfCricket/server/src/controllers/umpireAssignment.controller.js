import * as umpireAssignmentService from '../services/umpireAssignment.service.js'

export async function listUmpireSlots(req, res, next) {
  try {
    const slots = await umpireAssignmentService.listSlots(req.params.matchId)
    if (!slots) return res.status(404).json({ message: 'Match not found.' })
    res.json({ slots })
  } catch (err) {
    next(err)
  }
}

export async function applyForUmpireSlot(req, res, next) {
  try {
    const slot = await umpireAssignmentService.applyForSlot({ matchId: req.params.matchId, user: req.user })
    res.status(201).json({ slot })
  } catch (err) {
    next(err)
  }
}

export async function cancelUmpireAssignment(req, res, next) {
  try {
    const slot = await umpireAssignmentService.cancelAssignment({
      matchId: req.params.matchId,
      user: req.user,
      reason: typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 280) : null,
    })
    res.json({ slot })
  } catch (err) {
    next(err)
  }
}
