import * as umpireProposalService from '../services/umpireProposal.service.js'

// Ground Owner side.
export async function proposeUmpireForSlot(req, res, next) {
  try {
    const umpireUserId = Number(req.body?.umpireUserId)
    if (!Number.isInteger(umpireUserId)) return res.status(400).json({ error: 'umpireUserId is required.' })
    const proposal = await umpireProposalService.proposeUmpire(
      req.ground,
      Number(req.params.matchId),
      Number(req.params.slotId),
      umpireUserId,
      { incentiveAmount: req.body?.incentiveAmount, message: req.body?.message },
      req.user.id,
    )
    res.status(201).json({ proposal })
  } catch (err) {
    next(err)
  }
}

export async function listMatchProposals(req, res, next) {
  try {
    const proposals = await umpireProposalService.listProposalsForMatch(req.ground, Number(req.params.matchId))
    res.json({ proposals })
  } catch (err) {
    next(err)
  }
}

export async function cancelMatchProposal(req, res, next) {
  try {
    const proposal = await umpireProposalService.cancelProposal(req.ground, Number(req.params.matchId), Number(req.params.proposalId))
    res.json({ proposal })
  } catch (err) {
    next(err)
  }
}

// Umpire side.
export async function listMyProposals(req, res, next) {
  try {
    const proposals = await umpireProposalService.listMyProposals(req.user.id)
    res.json({ proposals })
  } catch (err) {
    next(err)
  }
}

export async function respondToMyProposal(req, res, next) {
  try {
    const accept = req.body?.accept === true
    const result = await umpireProposalService.respondToProposal(Number(req.params.proposalId), req.user.id, accept)
    res.json(accept ? { slot: result } : { proposal: result })
  } catch (err) {
    next(err)
  }
}
