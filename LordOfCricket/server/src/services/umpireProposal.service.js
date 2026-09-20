import { pool } from '../config/db.js'
import { findMatchById, findMatchByIdWithTeams } from '../models/match.model.js'
import { findSlotById, claimSpecificSlotForProposal } from '../models/matchUmpireSlot.model.js'
import { findUserById } from '../models/user.model.js'
import { isApprovedUmpireUser } from '../models/umpireRequest.model.js'
import { findActiveGroundOwnerUserIds } from '../models/groundUser.model.js'
import {
  insertProposal,
  findProposalById,
  findPendingProposalsForUmpire,
  findProposalsForMatch,
  findPendingProposalForSlotAndUmpire,
  updateProposalStatus,
  expirePendingProposalsForSlot,
  cancelProposal as cancelProposalModel,
} from '../models/umpireProposal.model.js'
import { insertAssignmentEvent } from '../models/matchUmpireSlot.model.js'
import { assertUmpireEligibleForMatch } from './umpireAssignment.service.js'
import { createNotification } from './groundNotification.service.js'
import { UmpireAssignmentError, UMPIRE_ASSIGNMENT_ERROR_CODES as CODES } from '../domain/umpireAssignment/errors.js'

const MAX_INCENTIVE = 100000 // a sanity ceiling, not a product limit — guards against a fat-fingered extra zero, matches no existing amount validation elsewhere doing more than this

function badRequest(message) {
  const err = new Error(message)
  err.statusCode = 400
  return err
}

async function resolveOwnedMatch(ground, matchId) {
  const match = await findMatchById(matchId)
  if (!match || match.ground_id !== ground.id) {
    throw new UmpireAssignmentError(CODES.MATCH_NOT_FOUND, 'Match not found for this ground.')
  }
  return match
}

function validateIncentive(incentiveAmount) {
  const amount = Number(incentiveAmount ?? 0)
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_INCENTIVE) {
    throw badRequest(`incentiveAmount must be a number between 0 and ${MAX_INCENTIVE}.`)
  }
  return amount
}

// Propose (Workstream: Browse Umpires + incentive offers) — a Ground Owner
// invites a SPECIFIC approved umpire to a SPECIFIC open slot, optionally
// with a bonus. Scoped to open slots only (AVAILABLE/CANCELLED) — a
// NO_SHOW slot stays the existing, separate assignReplacementUmpire flow,
// never touched by this. Multiple candidates can each get their own
// pending proposal for the same slot (confirmed product decision) — the
// partial unique index only blocks a DUPLICATE pending offer to the SAME
// umpire for the SAME slot.
export async function proposeUmpire(ground, matchId, slotId, umpireUserId, { incentiveAmount, message } = {}, actingUserId) {
  const match = await resolveOwnedMatch(ground, matchId)
  if (match.status !== 'upcoming') {
    throw new UmpireAssignmentError(CODES.MATCH_NOT_ELIGIBLE, 'This match is no longer accepting umpire proposals.')
  }

  const slot = await findSlotById(slotId)
  if (!slot || slot.match_id !== matchId) {
    throw new UmpireAssignmentError(CODES.SLOT_NOT_FOUND, 'Umpire slot not found for this match.')
  }
  if (slot.status !== 'AVAILABLE' && slot.status !== 'CANCELLED') {
    throw new UmpireAssignmentError(CODES.SLOT_NOT_ELIGIBLE, `This slot is '${slot.status}', not open for a proposal.`)
  }

  const candidate = await findUserById(umpireUserId)
  if (!candidate) throw new UmpireAssignmentError(CODES.MATCH_NOT_FOUND, 'Umpire not found.')

  // Same eligibility gate applyForSlot/assignReplacementUmpire already
  // share — a proposal must never be sendable to someone who couldn't
  // actually accept it. Re-checked again at accept time regardless, since
  // circumstances can change between proposal and response.
  await assertUmpireEligibleForMatch(match, candidate, pool)

  const amount = validateIncentive(incentiveAmount)
  const trimmedMessage = typeof message === 'string' && message.trim() ? message.trim().slice(0, 280) : null

  let proposal
  try {
    proposal = await insertProposal({ matchId, slotId, proposedBy: actingUserId, umpireUserId, incentiveAmount: amount, message: trimmedMessage })
  } catch (err) {
    if (err.code === '23505') {
      throw new UmpireAssignmentError(CODES.PROPOSAL_NOT_PENDING, 'This umpire already has a pending proposal for this slot.')
    }
    throw err
  }

  const withTeams = await findMatchByIdWithTeams(matchId)
  await createNotification({
    userId: umpireUserId,
    type: 'UMPIRE_PROPOSAL_RECEIVED',
    title: amount > 0 ? `Umpire offer: +₹${amount} bonus` : 'New umpiring proposal',
    body: `${withTeams.team_a_name} vs ${withTeams.team_b_name}${withTeams.venue ? ` at ${withTeams.venue}` : ''}.`,
    relatedMatchId: matchId,
  })

  return proposal
}

export async function listMyProposals(umpireUserId) {
  return findPendingProposalsForUmpire(umpireUserId)
}

export async function listProposalsForMatch(ground, matchId) {
  await resolveOwnedMatch(ground, matchId)
  return findProposalsForMatch(matchId)
}

// Accept/decline — accept is transactional and re-validates everything
// (match still upcoming, umpire still eligible, slot still open) since time
// may have passed since the offer was sent. On a successful claim, every
// OTHER pending proposal for the same slot is bulk-expired and those
// umpires notified — the "first to accept wins" mechanic.
export async function respondToProposal(proposalId, umpireUserId, accept) {
  const proposal = await findProposalById(proposalId)
  if (!proposal || proposal.umpire_user_id !== umpireUserId) {
    throw new UmpireAssignmentError(CODES.PROPOSAL_NOT_FOUND, 'Proposal not found.')
  }
  if (proposal.status !== 'PENDING') {
    throw new UmpireAssignmentError(CODES.PROPOSAL_NOT_PENDING, `This proposal is '${proposal.status}', no longer awaiting a response.`)
  }

  if (!accept) {
    const declined = await updateProposalStatus(proposalId, 'DECLINED')
    const match = await findMatchByIdWithTeams(proposal.match_id)
    await createNotification({
      userId: proposal.proposed_by,
      type: 'UMPIRE_PROPOSAL_DECLINED',
      title: 'Your umpire proposal was declined',
      body: match ? `${match.team_a_name} vs ${match.team_b_name}` : undefined,
      relatedMatchId: proposal.match_id,
    })
    return declined
  }

  const match = await findMatchById(proposal.match_id)
  if (!match) throw new UmpireAssignmentError(CODES.MATCH_NOT_FOUND, 'Match not found.')
  if (match.status !== 'upcoming') {
    await updateProposalStatus(proposalId, 'EXPIRED')
    throw new UmpireAssignmentError(CODES.MATCH_NOT_ELIGIBLE, 'This match is no longer accepting umpire assignments.')
  }
  const candidate = await findUserById(umpireUserId)
  if (!(await isApprovedUmpireUser(candidate))) {
    throw new UmpireAssignmentError(CODES.NOT_APPROVED_UMPIRE, 'Only an approved umpire may accept a proposal.')
  }

  const client = await pool.connect()
  let slot
  let otherExpired = []
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1)', [umpireUserId])

    // Same shared eligibility gate every assignment path uses. Note this
    // gate's own overlap check deliberately excludes THIS match (it only
    // guards cross-match conflicts) — the try/catch below is what actually
    // stops this same umpire from also holding the match's OTHER slot, via
    // the same idx_match_umpire_slots_active_umpire partial unique index
    // applyForSlot's own claimAvailableSlot already relies on.
    await assertUmpireEligibleForMatch(match, candidate, client)

    try {
      slot = await claimSpecificSlotForProposal(proposal.match_umpire_slot_id, umpireUserId, proposal.incentive_amount, client)
    } catch (err) {
      if (err.code === '23505') {
        throw new UmpireAssignmentError(CODES.ALREADY_ASSIGNED, 'You are already assigned to umpire this match.')
      }
      throw err
    }
    if (!slot) {
      // Someone else won the race, or the slot was otherwise filled/closed
      // since this proposal was sent.
      await updateProposalStatus(proposalId, 'EXPIRED', client)
      await client.query('COMMIT')
      throw new UmpireAssignmentError(CODES.SLOT_NOT_ELIGIBLE, 'This slot is no longer available — it may have just been filled.')
    }

    await updateProposalStatus(proposalId, 'ACCEPTED', client)
    otherExpired = await expirePendingProposalsForSlot(proposal.match_umpire_slot_id, proposalId, client)
    await insertAssignmentEvent({ slotId: slot.id, matchId: proposal.match_id, umpireUserId, eventType: 'ASSIGNED', recordedBy: umpireUserId }, client)

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  const withTeams = await findMatchByIdWithTeams(proposal.match_id)
  const matchLabel = withTeams ? `${withTeams.team_a_name} vs ${withTeams.team_b_name}` : undefined
  await createNotification({
    userId: proposal.proposed_by,
    type: 'UMPIRE_PROPOSAL_ACCEPTED',
    title: 'Your umpire proposal was accepted',
    body: matchLabel,
    relatedMatchId: proposal.match_id,
  })
  if (withTeams?.ground_id) {
    const ownerIds = (await findActiveGroundOwnerUserIds(withTeams.ground_id)).filter((id) => id !== proposal.proposed_by)
    await Promise.all(
      ownerIds.map((ownerId) =>
        createNotification({ userId: ownerId, type: 'UMPIRE_PROPOSAL_ACCEPTED', title: 'An umpire proposal was accepted', body: matchLabel, relatedMatchId: proposal.match_id }),
      ),
    )
  }
  // The umpires who lost the race are told the opportunity is gone.
  await Promise.all(
    otherExpired.map((p) =>
      createNotification({
        userId: p.umpire_user_id,
        type: 'UMPIRE_PROPOSAL_EXPIRED',
        title: 'That umpiring opportunity was filled',
        body: matchLabel,
        relatedMatchId: proposal.match_id,
      }),
    ),
  )

  return slot
}

export async function cancelProposal(ground, matchId, proposalId) {
  await resolveOwnedMatch(ground, matchId)
  const proposal = await findProposalById(proposalId)
  if (!proposal || proposal.match_id !== matchId) {
    throw new UmpireAssignmentError(CODES.PROPOSAL_NOT_FOUND, 'Proposal not found.')
  }
  const cancelled = await cancelProposalModel(proposalId)
  if (!cancelled) {
    throw new UmpireAssignmentError(CODES.PROPOSAL_NOT_PENDING, `This proposal is '${proposal.status}', it can no longer be withdrawn.`)
  }
  await createNotification({
    userId: proposal.umpire_user_id,
    type: 'UMPIRE_PROPOSAL_WITHDRAWN',
    title: 'A umpiring proposal was withdrawn',
    relatedMatchId: matchId,
  })
  return cancelled
}

// Exported for the apply-flow's own use (see umpireAssignment.service.js) —
// a slot filled by direct self-apply must not leave stale pending
// proposals for other umpires dangling.
export { expirePendingProposalsForSlot }

// Exported for tests/consumers that need to check "does this umpire
// already have a pending offer for this slot" without going through the
// full propose flow.
export { findPendingProposalForSlotAndUmpire }
