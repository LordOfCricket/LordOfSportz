import { prisma } from '../config/prisma.js'
import * as repo from '../repositories/prisma/auction.prisma-repository.js'
import {
  AUCTION_STATES,
  canTransitionAuction,
  isConfigurable,
  readinessErrors,
} from '../domain/auction/auctionState.js'
import { isValidAmount, remainingPurse, fromPaise } from '../domain/auction/money.js'

// Auction orchestration. Authorization is NOT done here — it is already done by
// middlewares/auctionAccess.js before any of these run, the same split every
// other LOC service uses.
//
// Phase A covers auction lifecycle up to LIVE plus roster configuration.
// The transactional bid engine (nominate/bid/sell) is Phase B; the state table
// and money helpers it needs already exist in domain/auction/.

export class AuctionError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'AuctionError'
    this.code = code
    this.status = status
  }
}

function assertConfigurable(auction) {
  if (!isConfigurable(auction.state)) {
    throw new AuctionError(
      'AUCTION_NOT_CONFIGURABLE',
      'This auction can no longer be configured.',
      409,
    )
  }
}

export async function createAuction({ groundId, createdBy, timerSeconds }) {
  if (timerSeconds !== undefined && (!Number.isInteger(timerSeconds) || timerSeconds <= 0)) {
    throw new AuctionError('INVALID_TIMER', 'timerSeconds must be a positive integer.')
  }

  const auction = await repo.insertAuction({
    groundId,
    createdBy,
    timerSeconds: timerSeconds ?? 120,
  })
  await repo.insertAuditLog({
    auctionId: auction.id,
    actorId: createdBy,
    action: 'auction.created',
    targetType: 'auction',
    targetId: auction.id,
  })
  return auction
}

export function getAuctionDetail(auctionId) {
  return repo.findAuctionDetail(auctionId)
}

export function listAuctionsForGround(groundId, filters) {
  return repo.listAuctionsForGround(groundId, filters)
}

export async function addParticipant({ auction, teamId, initialPurse, actorId }) {
  assertConfigurable(auction)

  if (!Number.isInteger(teamId)) {
    throw new AuctionError('INVALID_TEAM', 'teamId must be an integer.')
  }
  if (!isValidAmount(initialPurse)) {
    throw new AuctionError('INVALID_PURSE', 'initialPurse must be a positive amount with at most 2 decimals.')
  }

  const team = await prisma.teams.findUnique({ where: { id: teamId } })
  if (!team) throw new AuctionError('TEAM_NOT_FOUND', 'Team not found.', 404)

  const existing = await repo.findParticipant(auction.id, teamId)
  if (existing) {
    throw new AuctionError('TEAM_ALREADY_PARTICIPANT', 'This team is already in the auction.', 409)
  }

  const participant = await repo.insertParticipant({
    auctionId: auction.id,
    teamId,
    initialPurse,
  })
  await repo.insertAuditLog({
    auctionId: auction.id,
    actorId,
    action: 'auction.participant_added',
    targetType: 'team',
    targetId: String(teamId),
    metadata: { initialPurse: String(initialPurse) },
  })
  return participant
}

export async function removeParticipant({ auction, participantId, actorId }) {
  assertConfigurable(auction)

  const participants = await repo.listParticipants(auction.id)
  const participant = participants.find((p) => p.id === participantId)
  if (!participant) {
    throw new AuctionError('PARTICIPANT_NOT_FOUND', 'Participant not found in this auction.', 404)
  }

  await repo.deleteParticipant(participantId)
  await repo.insertAuditLog({
    auctionId: auction.id,
    actorId,
    action: 'auction.participant_removed',
    targetType: 'team',
    targetId: String(participant.team_id),
  })
}

export async function addLot({ auction, playerId, basePrice, actorId }) {
  assertConfigurable(auction)

  if (!Number.isInteger(playerId)) {
    throw new AuctionError('INVALID_PLAYER', 'playerId must be an integer.')
  }
  if (!isValidAmount(basePrice)) {
    throw new AuctionError('INVALID_BASE_PRICE', 'basePrice must be a positive amount with at most 2 decimals.')
  }

  const player = await prisma.players.findUnique({ where: { id: playerId } })
  if (!player) throw new AuctionError('PLAYER_NOT_FOUND', 'Player not found.', 404)

  const existing = await repo.findLot(auction.id, playerId)
  if (existing) {
    throw new AuctionError('PLAYER_ALREADY_IN_POOL', 'This player is already in the auction pool.', 409)
  }

  // lot_number is assigned server-side from the current pool size, never taken
  // from the client — a client-chosen number could collide with an existing lot
  // or reorder the pool.
  const lotNumber = (await repo.countLots(auction.id)) + 1

  const lot = await repo.insertLot({
    auctionId: auction.id,
    playerId,
    basePrice,
    lotNumber,
  })
  await repo.insertAuditLog({
    auctionId: auction.id,
    actorId,
    action: 'auction.lot_added',
    targetType: 'player',
    targetId: String(playerId),
    metadata: { basePrice: String(basePrice), lotNumber },
  })
  return lot
}

export function listLots(auctionId) {
  return repo.listLots(auctionId)
}

export function listParticipants(auctionId) {
  return repo.listParticipants(auctionId)
}

async function transition({ auction, to, actorId, action, extraData = {} }) {
  if (!canTransitionAuction(auction.state, to)) {
    throw new AuctionError(
      'INVALID_STATE_TRANSITION',
      `An auction cannot go from ${auction.state} to ${to}.`,
      409,
    )
  }

  const updated = await repo.updateAuctionState(auction.id, { state: to, ...extraData })
  await repo.insertAuditLog({
    auctionId: auction.id,
    actorId,
    action,
    targetType: 'auction',
    targetId: auction.id,
    metadata: { from: auction.state, to },
  })
  await repo.insertEvent({ auctionId: auction.id, eventType: action, metadata: { from: auction.state, to } })
  return updated
}

// DRAFT -> READY. The readiness rules (enough teams, at least one player) are
// checked here rather than at creation so an auction can be assembled
// incrementally and only validated when it is declared ready.
export async function markReady({ auction, actorId }) {
  const [participantCount, lotCount] = await Promise.all([
    repo.countParticipants(auction.id),
    repo.countLots(auction.id),
  ])

  const errors = readinessErrors({ participantCount, lotCount })
  if (errors.length > 0) {
    throw new AuctionError('AUCTION_NOT_READY', errors.join(' '), 409)
  }

  return transition({ auction, to: AUCTION_STATES.READY, actorId, action: 'auction.ready' })
}

export function startAuction({ auction, actorId }) {
  return transition({
    auction,
    to: AUCTION_STATES.LIVE,
    actorId,
    action: 'auction.started',
    extraData: { started_at: new Date() },
  })
}

export function pauseAuction({ auction, actorId }) {
  return transition({ auction, to: AUCTION_STATES.PAUSED, actorId, action: 'auction.paused' })
}

export function resumeAuction({ auction, actorId }) {
  return transition({ auction, to: AUCTION_STATES.LIVE, actorId, action: 'auction.resumed' })
}

export function completeAuction({ auction, actorId }) {
  return transition({
    auction,
    to: AUCTION_STATES.COMPLETED,
    actorId,
    action: 'auction.completed',
    extraData: { ended_at: new Date() },
  })
}

export function cancelAuction({ auction, actorId }) {
  return transition({
    auction,
    to: AUCTION_STATES.CANCELLED,
    actorId,
    action: 'auction.cancelled',
    extraData: { ended_at: new Date() },
  })
}

// Purse is always derived from initial_purse - current_spent, never stored as a
// third column that could drift out of sync with the other two.
export async function getPurseState(auctionId) {
  const participants = await repo.listParticipants(auctionId)
  return participants.map((p) => {
    const remaining = remainingPurse(p.initial_purse, p.current_spent)
    return {
      participantId: p.id,
      teamId: p.team_id,
      teamName: p.team?.name ?? null,
      initialPurse: String(p.initial_purse),
      currentSpent: String(p.current_spent),
      remainingPurse: remaining === null ? null : fromPaise(remaining),
    }
  })
}
