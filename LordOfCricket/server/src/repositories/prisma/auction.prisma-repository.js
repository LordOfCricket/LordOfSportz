import { prisma } from '../../config/prisma.js'

// Auction tables are brand-new and Prisma-managed, so they follow the same
// repository convention as the other brand-new tables (sessions, otp_codes)
// rather than the raw-SQL models/ convention the pre-existing tables use.
//
// This layer is intentionally thin: no business rules live here, only queries.
// State-transition and purse rules belong in services/auction.service.js so
// there is exactly one place they are enforced.

export function findAuctionById(auctionId) {
  return prisma.auctions.findUnique({ where: { id: auctionId } })
}

export function findAuctionDetail(auctionId) {
  return prisma.auctions.findUnique({
    where: { id: auctionId },
    include: {
      participants: { include: { team: true }, orderBy: { created_at: 'asc' } },
      lots: { include: { player: true, winning_team: true }, orderBy: { lot_number: 'asc' } },
    },
  })
}

export function listAuctionsForGround(groundId, { state } = {}) {
  return prisma.auctions.findMany({
    where: { ground_id: groundId, ...(state ? { state } : {}) },
    orderBy: { created_at: 'desc' },
  })
}

export function insertAuction({ groundId, createdBy, timerSeconds }) {
  return prisma.auctions.create({
    data: { ground_id: groundId, created_by: createdBy, timer_seconds: timerSeconds },
  })
}

export function updateAuctionState(auctionId, data) {
  return prisma.auctions.update({
    where: { id: auctionId },
    data: { ...data, updated_at: new Date() },
  })
}

export function insertParticipant({ auctionId, teamId, initialPurse }) {
  return prisma.auction_participants.create({
    data: { auction_id: auctionId, team_id: teamId, initial_purse: initialPurse },
    include: { team: true },
  })
}

export function findParticipant(auctionId, teamId) {
  return prisma.auction_participants.findUnique({
    where: { auction_id_team_id: { auction_id: auctionId, team_id: teamId } },
  })
}

export function listParticipants(auctionId) {
  return prisma.auction_participants.findMany({
    where: { auction_id: auctionId },
    include: { team: true },
    orderBy: { created_at: 'asc' },
  })
}

export function deleteParticipant(participantId) {
  return prisma.auction_participants.delete({ where: { id: participantId } })
}

export function insertLot({ auctionId, playerId, basePrice, lotNumber }) {
  return prisma.auction_lots.create({
    data: {
      auction_id: auctionId,
      player_id: playerId,
      base_price: basePrice,
      lot_number: lotNumber,
    },
    include: { player: true },
  })
}

export function findLot(auctionId, playerId) {
  return prisma.auction_lots.findUnique({
    where: { auction_id_player_id: { auction_id: auctionId, player_id: playerId } },
  })
}

export function listLots(auctionId) {
  return prisma.auction_lots.findMany({
    where: { auction_id: auctionId },
    include: { player: true, winning_team: true },
    orderBy: { lot_number: 'asc' },
  })
}

export function countLots(auctionId) {
  return prisma.auction_lots.count({ where: { auction_id: auctionId } })
}

export function countParticipants(auctionId) {
  return prisma.auction_participants.count({ where: { auction_id: auctionId } })
}

export function insertAuditLog({ auctionId, actorId, action, targetType, targetId, metadata }) {
  return prisma.auction_audit_logs.create({
    data: {
      auction_id: auctionId,
      actor_id: actorId,
      action,
      target_type: targetType ?? null,
      target_id: targetId ?? null,
      metadata: metadata ?? null,
    },
  })
}

export function insertEvent({ auctionId, eventType, metadata }) {
  return prisma.auction_events.create({
    data: { auction_id: auctionId, event_type: eventType, metadata: metadata ?? null },
  })
}
