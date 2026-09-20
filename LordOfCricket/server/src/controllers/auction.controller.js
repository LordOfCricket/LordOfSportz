import * as auctionService from '../services/auction.service.js'
import { AuctionError } from '../services/auction.service.js'

// Thin controllers, matching every other LOC controller: parse input, call the
// service, shape the response. Authorization already happened in middleware
// (requireAuth + requireGroundRole / requireAuctionManager / requireAuctionViewer),
// and req.ground / req.auction are set by it — never re-derived from the body.

function handle(err, res, next) {
  if (err instanceof AuctionError) {
    return res.status(err.status).json({ code: err.code, error: err.message })
  }
  return next(err)
}

// POST /api/grounds/:publicGroundId/auctions
// req.ground comes from requireGroundRole('GROUND_OWNER') — the auction's
// ground is never read from the request body.
export async function createAuction(req, res, next) {
  try {
    const auction = await auctionService.createAuction({
      groundId: req.ground.id,
      createdBy: req.user.id,
      timerSeconds: req.body.timerSeconds,
    })
    res.status(201).json({ auction })
  } catch (err) {
    handle(err, res, next)
  }
}

// GET /api/grounds/:publicGroundId/auctions
export async function listAuctions(req, res, next) {
  try {
    const auctions = await auctionService.listAuctionsForGround(req.ground.id, {
      state: req.query.state,
    })
    res.json({ auctions })
  } catch (err) {
    handle(err, res, next)
  }
}

// GET /api/auctions/:auctionId
export async function getAuction(req, res, next) {
  try {
    const auction = await auctionService.getAuctionDetail(req.auction.id)
    res.json({ auction })
  } catch (err) {
    handle(err, res, next)
  }
}

// GET /api/auctions/:auctionId/purse
export async function getPurse(req, res, next) {
  try {
    const purse = await auctionService.getPurseState(req.auction.id)
    res.json({ purse })
  } catch (err) {
    handle(err, res, next)
  }
}

// POST /api/auctions/:auctionId/participants
export async function addParticipant(req, res, next) {
  try {
    const participant = await auctionService.addParticipant({
      auction: req.auction,
      teamId: req.body.teamId,
      initialPurse: req.body.initialPurse,
      actorId: req.user.id,
    })
    res.status(201).json({ participant })
  } catch (err) {
    handle(err, res, next)
  }
}

// DELETE /api/auctions/:auctionId/participants/:participantId
export async function removeParticipant(req, res, next) {
  try {
    await auctionService.removeParticipant({
      auction: req.auction,
      participantId: req.params.participantId,
      actorId: req.user.id,
    })
    res.json({ message: 'Participant removed.' })
  } catch (err) {
    handle(err, res, next)
  }
}

// POST /api/auctions/:auctionId/lots
export async function addLot(req, res, next) {
  try {
    const lot = await auctionService.addLot({
      auction: req.auction,
      playerId: req.body.playerId,
      basePrice: req.body.basePrice,
      actorId: req.user.id,
    })
    res.status(201).json({ lot })
  } catch (err) {
    handle(err, res, next)
  }
}

// GET /api/auctions/:auctionId/lots
export async function listLots(req, res, next) {
  try {
    const lots = await auctionService.listLots(req.auction.id)
    res.json({ lots })
  } catch (err) {
    handle(err, res, next)
  }
}

function transitionHandler(serviceFn) {
  return async (req, res, next) => {
    try {
      const auction = await serviceFn({ auction: req.auction, actorId: req.user.id })
      res.json({ auction })
    } catch (err) {
      handle(err, res, next)
    }
  }
}

export const markReady = transitionHandler(auctionService.markReady)
export const startAuction = transitionHandler(auctionService.startAuction)
export const pauseAuction = transitionHandler(auctionService.pauseAuction)
export const resumeAuction = transitionHandler(auctionService.resumeAuction)
export const completeAuction = transitionHandler(auctionService.completeAuction)
export const cancelAuction = transitionHandler(auctionService.cancelAuction)
