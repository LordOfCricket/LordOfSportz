import * as proposalService from '../services/matchProposal.service.js'
import { BookingError, BOOKING_ERROR_CODES } from '../domain/booking/errors.js'

// Phase 25 — thin HTTP glue, same convention as teamBooking.controller.js.

function serializeProposal(proposal, booking = null) {
  return {
    publicProposalId: proposal.public_proposal_id,
    status: proposal.status,
    proposingTeamId: proposal.proposing_team_id,
    acceptedByTeamId: proposal.accepted_by_team_id,
    proposalExpiresAt: proposal.proposal_expires_at,
    createdAt: proposal.created_at,
    updatedAt: proposal.updated_at,
    ...(booking
      ? {
          publicBookingId: booking.public_booking_id,
          startTime: booking.start_time,
          endTime: booking.end_time,
          matchFormat: booking.match_format,
          purpose: booking.purpose,
          bookingStatus: booking.status,
        }
      : {}),
  }
}

function assertProposalBelongsToUrlGround(proposal, req) {
  if (proposal.ground_id !== req.ground.id) {
    throw new BookingError(BOOKING_ERROR_CODES.PROPOSAL_NOT_FOUND, 'Proposal not found.')
  }
}

export async function createMatchProposal(req, res, next) {
  try {
    const { matchFormat, startTime, endTime, teamId, participantPlayerIds, purpose, notes, clientActionId, expiresInHours } = req.body
    const { proposal, booking, idempotentReplay } = await proposalService.createMatchProposal({
      ground: req.ground,
      actingUserId: req.user.id,
      matchFormat: matchFormat || null,
      startTime: startTime ? new Date(startTime) : null,
      endTime: endTime ? new Date(endTime) : null,
      teamId: teamId != null ? Number(teamId) : null,
      participantPlayerIds: participantPlayerIds || [],
      purpose: purpose || null,
      notes: notes || null,
      clientActionId: clientActionId || null,
      expiresInHours: expiresInHours != null ? Number(expiresInHours) : undefined,
    })
    res.status(idempotentReplay ? 200 : 201).json({ proposal: serializeProposal(proposal, booking) })
  } catch (err) {
    next(err)
  }
}

export async function listOpenProposals(req, res, next) {
  try {
    const rows = await proposalService.listOpenProposalsForGround(req.ground.id)
    res.json({
      proposals: rows.map((r) => ({
        publicProposalId: r.public_proposal_id,
        status: r.status,
        proposingTeamId: r.proposing_team_id,
        proposingTeamName: r.proposing_team_name,
        proposingTeamShortName: r.proposing_team_short_name,
        startTime: r.start_time,
        endTime: r.end_time,
        matchFormat: r.match_format,
        purpose: r.purpose,
        proposalExpiresAt: r.proposal_expires_at,
      })),
    })
  } catch (err) {
    next(err)
  }
}

export async function getMatchProposal(req, res, next) {
  try {
    const { proposal, booking } = await proposalService.findProposalDetail(req.params.publicProposalId)
    assertProposalBelongsToUrlGround(proposal, req)
    res.json({ proposal: serializeProposal(proposal, booking) })
  } catch (err) {
    next(err)
  }
}

export async function acceptMatchProposal(req, res, next) {
  try {
    const { proposal } = await proposalService.findProposalDetail(req.params.publicProposalId)
    assertProposalBelongsToUrlGround(proposal, req)
    const { teamId, participantPlayerIds } = req.body
    const result = await proposalService.acceptMatchProposal({
      publicProposalId: req.params.publicProposalId,
      actingUserId: req.user.id,
      acceptingTeamId: teamId != null ? Number(teamId) : null,
      participantPlayerIds: participantPlayerIds || [],
    })
    res.status(result.idempotentReplay ? 200 : 200).json({ proposal: serializeProposal(result.proposal, result.booking) })
  } catch (err) {
    next(err)
  }
}

export async function cancelMatchProposal(req, res, next) {
  try {
    const { proposal } = await proposalService.findProposalDetail(req.params.publicProposalId)
    assertProposalBelongsToUrlGround(proposal, req)
    const updated = await proposalService.cancelMatchProposal(req.params.publicProposalId, {
      actingUserId: req.user.id,
      reason: req.body?.reason || null,
    })
    res.json({ proposal: serializeProposal(updated) })
  } catch (err) {
    next(err)
  }
}
