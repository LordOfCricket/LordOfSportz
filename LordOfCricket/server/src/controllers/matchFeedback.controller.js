import * as matchFeedbackService from '../services/matchFeedback.service.js'

export async function getMatchFeedback(req, res, next) {
  try {
    const context = await matchFeedbackService.getFeedbackContext(req.params.matchId, req.user.id)
    res.json(context)
  } catch (err) {
    next(err)
  }
}

export async function postMatchFeedback(req, res, next) {
  try {
    const feedback = await matchFeedbackService.submitFeedback({ matchId: req.params.matchId, userId: req.user.id, body: req.body })
    res.status(201).json({ feedback })
  } catch (err) {
    next(err)
  }
}
