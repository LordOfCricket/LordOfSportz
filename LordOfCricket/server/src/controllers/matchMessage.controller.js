import * as matchMessageService from '../services/matchMessage.service.js'

export async function listMatchMessages(req, res, next) {
  try {
    const messages = await matchMessageService.listMessages(Number(req.params.matchId), req.user)
    res.json({ messages })
  } catch (err) {
    next(err)
  }
}

export async function sendMatchMessage(req, res, next) {
  try {
    const message = await matchMessageService.sendMessage(Number(req.params.matchId), req.user, req.body?.body, req.io)
    res.status(201).json({ message })
  } catch (err) {
    next(err)
  }
}
