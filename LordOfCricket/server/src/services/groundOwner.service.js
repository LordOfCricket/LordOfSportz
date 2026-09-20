import { pool } from '../config/db.js'
import { findGroundsOwnedByUser } from '../models/groundUser.model.js'
import { findMatchesByGroundId, findMatchById, findMatchByIdWithTeams, updateMatch } from '../models/match.model.js'
import {
  findSlotsByMatch,
  findSlotById,
  markNoShow as markSlotNoShowModel,
  assignReplacementToSlot,
  insertAssignmentEvent,
  cancelAllAssignedSlotsForMatch,
} from '../models/matchUmpireSlot.model.js'
import { findUserById } from '../models/user.model.js'
import { findIncidentsByMatch } from '../models/matchIncident.model.js'
import { expirePendingProposalsForSlot } from '../models/umpireProposal.model.js'
import * as matchService from './match.service.js'
import { assertUmpireEligibleForMatch } from './umpireAssignment.service.js'
import { buildReputationSummaries } from './umpireReputation.service.js'
import { findEligibleUmpireCandidates } from './umpireEligibility.service.js'
import { UmpireAssignmentError, UMPIRE_ASSIGNMENT_ERROR_CODES as CODES } from '../domain/umpireAssignment/errors.js'
import { createNotification } from './groundNotification.service.js'
import { ensureEarningRecordsForMatch, findEarningsForMatch, findEarningBySlotId, updatePaymentStatus as updatePaymentStatusModel } from '../models/umpireEarning.model.js'
import { isValidPaymentStatusTransition } from '../domain/umpireCommerce/paymentStatus.js'
import { utcToGroundLocalParts } from '../domain/shared/groundTime.js'
import { computeStaffingForecast } from '../domain/umpireRecommendation/staffingForecast.js'
import { getStaffDashboard } from './groundDashboard.service.js'
import * as bookingRepo from '../repositories/groundBooking.repository.js'
import { groundTodayDateStr, groundLocalToUtc, addDaysToDateStr } from '../domain/booking/timezone.js'
import { getDailyTimeline } from './groundTimeline.service.js'
import { getDayAvailability } from './groundBooking.service.js'
import { findCanteensByGroundId } from '../models/canteen.model.js'
import { countOrdersByStatusForGround, sumCompletedRevenueForGround, topSellingItemsForGround } from '../models/canteenOrder.model.js'
import { lowStockItemsForCanteen } from '../models/canteenTodayMenu.model.js'
import { countStaffByRoleAndStatus } from '../models/groundUser.model.js'

// A ground-level aggregate below this many reviews is displayed as "not
// enough data" rather than a misleading average (Workstream J's own
// warning) — same spirit as ranking.js's ENOUGH_DATA_FLOOR, kept local
// since this is a distinct "is this ground-month aggregate meaningful"
// question, not a badge/ranking-consistency one.
const GROUND_RATING_MIN_SAMPLE = 5

function badRequest(message) {
  const err = new Error(message)
  err.statusCode = 400
  return err
}

function notFound(message) {
  const err = new Error(message)
  err.statusCode = 404
  return err
}

function conflict(message) {
  const err = new Error(message)
  err.statusCode = 409
  return err
}

// Every ground-owner-scoped match action shares this same check: `ground`
// is the authorized row requireGroundRole already resolved from the URL's
// :publicGroundId (never client-supplied); this additionally confirms the
// TARGET match actually belongs to THAT ground before any lifecycle action
// touches it — a 404, not a 403, so an owner can never even confirm another
// ground's match exists by probing match ids.
async function resolveOwnedMatch(ground, matchId) {
  const match = await findMatchById(matchId)
  if (!match || match.ground_id !== ground.id) {
    throw notFound('Match not found for this ground.')
  }
  return match
}

async function notifyAssignedUmpires(matchId, { type, title, body }) {
  const slots = await findSlotsByMatch(matchId)
  // 'COMPLETED' as well as 'ASSIGNED' (Phase 23): completeGroundMatch calls
  // this AFTER matchService.completeMatchManually has already flipped the
  // umpire's slot ASSIGNED -> COMPLETED (officiating credit), so by the time
  // the MATCH_COMPLETED notification fires, ASSIGNED alone would find nobody.
  // Safe for the MATCH_STARTING call site too — a slot is never COMPLETED
  // before its match completes, so this can't broaden who gets notified there.
  const umpireUserIds = slots.filter((s) => (s.status === 'ASSIGNED' || s.status === 'COMPLETED') && s.umpire_user_id).map((s) => s.umpire_user_id)
  await Promise.all(umpireUserIds.map((userId) => createNotification({ userId, type, title, body, relatedMatchId: matchId })))
}

// Slot aggregates cover 'upcoming'/'live' matches only — a completed/
// finalized match's umpire slots are history, not something the owner needs
// to see filling. upcomingMatchesCount stays strictly 'upcoming' (matches
// the dashboard's own "Upcoming Matches" label).
export async function listMyGrounds(userId) {
  const grounds = await findGroundsOwnedByUser(userId)
  return Promise.all(
    grounds.map(async (ground) => {
      const matches = await findMatchesByGroundId(ground.id)
      const relevant = matches.filter((m) => m.status === 'upcoming' || m.status === 'live')
      return {
        ...ground,
        upcomingMatchesCount: matches.filter((m) => m.status === 'upcoming').length,
        umpireSlotsTotal: relevant.reduce((sum, m) => sum + m.total_slots, 0),
        umpireSlotsFilled: relevant.reduce((sum, m) => sum + m.filled_slots, 0),
      }
    }),
  )
}

// `ground` is already the authorized, resolved row requireGroundRole
// attached to req.ground — ground.id here is never client-supplied.
//
// Umpire Intelligence & Scale 2.0, Workstream K — each 'upcoming' match
// gains a deterministic `staffingForecast` field, computed from data
// already on the row (filled_slots/total_slots/match_date) — no new query.
// `new Date(m.match_date).getTime()` vs `Date.now()` is a plain instant
// difference (timezone-invariant once both sides are real Date objects) —
// the SAME read path matchTimeRange.js#estimateMatchTimeRange already uses
// elsewhere in this codebase for match_date, not a new/4th interpretation
// (Workstream Y). Its known, disclosed Node-process-TZ dependency (flagged,
// not fixed, in Communication & Commercial 2.0) applies equally here — no
// new risk introduced.
export async function listGroundMatches(ground) {
  const matches = await findMatchesByGroundId(ground.id)
  return matches.map((m) => {
    if (m.status !== 'upcoming') return m
    const hoursUntilMatch = (new Date(m.match_date).getTime() - Date.now()) / (60 * 60 * 1000)
    return {
      ...m,
      staffingForecast: computeStaffingForecast({ filledSlots: m.filled_slots, totalSlots: m.total_slots, hoursUntilMatch }),
    }
  })
}

// U8 hardening fix: oversPerInnings/ballsPerOver were never accepted here at
// all (only teams/date/requiredUmpires) — every ground-owner-created match
// silently got oversPerInnings=NULL, which means "no overs limit" to the
// scoring engine, so an innings can never auto-complete from overs bowled.
// Discovered by the U8 end-to-end test actually playing a match out via
// real scoring, not the status-shortcut every earlier test used. Both are
// optional, same as the legacy POST /matches — omitting them keeps prior
// behavior for any caller that only ever sent the original 4 fields.
export async function createGroundMatch(ground, { teamAId, teamBId, matchDate, requiredUmpires, oversPerInnings, ballsPerOver }) {
  if (ground.status !== 'ACTIVE') {
    throw badRequest(`This ground is '${ground.status}' and cannot have matches created for it yet.`)
  }
  // Reuses match.service.js#createMatch exactly — the SAME function
  // POST /matches calls — so team validation, date validation, and
  // transaction-safe umpire-slot creation (U3) are never duplicated here.
  // groundId comes from the authorized ground context, never client input —
  // closing the "arbitrary groundId" gap flagged back in U3.1.
  return matchService.createMatch({
    teamAId,
    teamBId,
    matchDate,
    requiredUmpires,
    oversPerInnings,
    ballsPerOver,
    groundId: ground.id,
    venue: ground.name,
  })
}

// Ground-owner-scoped umpire staffing detail — same real per-slot data
// (findSlotsByMatch, already returns umpire_name via its own LEFT JOIN
// users) the generic /matches/:matchId/umpire-slots route already exposes,
// just properly scoped to the authorized owner of the match's own ground
// rather than any authenticated user. No phone number: users has no phone
// column anywhere in this schema — never fabricated, simply not returned.
//
// Phase 24 — each slot with an umpire gets a `reputation` summary, fetched
// via ONE batched call (buildReputationSummaries) across every distinct
// umpire on this match's slots, never one query per slot.
// Umpire Communication & Commercial 2.0 — self-heals earnings for any slot
// that completed since the last view (ensureEarningRecordsForMatch is
// idempotent), then attaches the match's fee + each slot's earning/payment
// status. No new "commercial view" endpoint — this existing response is
// additively extended, matching Workstream X's "one cohesive response"
// guidance exactly the way Reputation 2.0 already did for this same route.
export async function getMatchUmpireSlots(ground, matchId) {
  const match = await resolveOwnedMatch(ground, matchId)
  await ensureEarningRecordsForMatch(matchId)
  const [slots, earnings] = await Promise.all([findSlotsByMatch(matchId), findEarningsForMatch(matchId)])
  const umpireIds = slots.map((s) => s.umpire_user_id).filter(Boolean)
  const summaries = await buildReputationSummaries(umpireIds)
  const earningsBySlot = new Map(earnings.map((e) => [e.match_umpire_slot_id, e]))
  return {
    umpireFee:
      match.umpire_fee_amount != null ? { amount: match.umpire_fee_amount, currency: match.umpire_fee_currency } : null,
    slots: slots.map((slot) => {
      const earning = earningsBySlot.get(slot.id)
      return {
        ...slot,
        reputation: slot.umpire_user_id ? summaries.get(slot.umpire_user_id) || null : null,
        earning: earning ? { id: earning.id, amount: earning.amount, currency: earning.currency, status: earning.status } : null,
      }
    }),
  }
}

// Fee = per-umpire, applied uniformly to every slot on the match (confirmed
// semantic — no prior precedent existed anywhere in LOC). Only the owning
// Ground Owner may set/update it, and never once the match has reached a
// terminal state (Workstream R) — enforced here, in the service layer,
// matching every other write-time business rule in this codebase (no DB
// trigger).
export async function setMatchUmpireFee(ground, matchId, actingUserId, { amount, currency = 'INR' }) {
  const match = await resolveOwnedMatch(ground, matchId)
  if (match.status === 'completed' || match.status === 'finalized') {
    throw conflict('The umpire fee cannot be changed once the match has completed.')
  }
  const numericAmount = Number(amount)
  if (!Number.isFinite(numericAmount) || numericAmount < 0) {
    throw badRequest('amount must be a non-negative number.')
  }
  if (typeof currency !== 'string' || currency.length !== 3) {
    throw badRequest('currency must be a 3-letter code.')
  }
  return updateMatch(matchId, {
    umpire_fee_amount: numericAmount.toFixed(2),
    umpire_fee_currency: currency.toUpperCase(),
    umpire_fee_set_by: actingUserId,
    umpire_fee_updated_at: new Date(),
  })
}

// Payment status — only the owning Ground Owner may transition it, and only
// along the documented, terminal-state-guarded transitions
// (isValidPaymentStatusTransition). amount/currency/umpireId are never
// accepted from the request body here — they were already fixed at
// earning-creation time from the match's own fee (Workstream S: never trust
// client-supplied commercial values).
export async function updateSlotPaymentStatus(ground, matchId, slotId, status) {
  await resolveOwnedMatch(ground, matchId)
  const slot = await findSlotById(slotId)
  if (!slot || slot.match_id !== matchId) {
    throw notFound('Umpire slot not found for this match.')
  }
  const earning = await findEarningBySlotId(slotId)
  if (!earning) {
    throw notFound('No earning record exists for this slot yet.')
  }
  if (!isValidPaymentStatusTransition(earning.status, status)) {
    throw conflict(`Cannot move payment status from '${earning.status}' to '${status}'.`)
  }
  return updatePaymentStatusModel(earning.id, status)
}

// "Match is Starting" — reuses match.service.js#startMatch verbatim (toss/
// playing-XI/understaffed preconditions all unchanged, exactly the same
// function the assigned umpire's own /matches/:id/start already calls) —
// this route only adds WHO may call it for a ground-owned match.
export async function startGroundMatch(ground, matchId, { confirmUnderstaffed = false } = {}) {
  await resolveOwnedMatch(ground, matchId)
  const match = await matchService.startMatch(matchId, { confirmUnderstaffed })
  const withTeams = await findMatchByIdWithTeams(matchId)
  await notifyAssignedUmpires(matchId, {
    type: 'MATCH_STARTING',
    title: 'Your assigned match is starting',
    body: `${withTeams.team_a_name} vs ${withTeams.team_b_name} is now live.`,
  })
  return match
}

// "Match is Over" — reuses match.service.js#completeMatchManually (idempotent
// no-op if the scoring engine already auto-completed it, otherwise a manual
// NO_RESULT transition). Only notifies on a REAL transition, never on the
// no-op branch (the umpire already effectively knows scoring ended, and a
// duplicate notification for the same event would be noise).
export async function completeGroundMatch(ground, matchId) {
  await resolveOwnedMatch(ground, matchId)
  const { match, transitioned } = await matchService.completeMatchManually(matchId)
  if (transitioned) {
    const withTeams = await findMatchByIdWithTeams(matchId)
    await notifyAssignedUmpires(matchId, {
      type: 'MATCH_COMPLETED',
      title: 'Your match has ended',
      body: `${withTeams.team_a_name} vs ${withTeams.team_b_name} at ${ground.name} has ended.`,
    })
  }
  // `transitioned` surfaced to the controller (Phase 4, Umpire Module) so it
  // can publishMatchState only on a REAL transition — same "no-op branch
  // gets no broadcast" principle the notification above already follows,
  // and matches match.controller.js#startMatch/finalizeMatch's own
  // unconditional-on-success publish, which this ground-owner path had been
  // missing entirely (a spectator sitting on the match page never learned
  // it ended until their next poll/reconnect).
  return { match, transitioned }
}

// Pre-match cancellation (Phase 6, Umpire Module) — the one confirmed-
// missing match lifecycle action from the Phase 5 audit (deleteMatch in
// match.model.js is dead code, zero call sites). Deliberately minimal
// scope, per that phase's own instruction:
// - Only an 'upcoming' match may be cancelled. Once live, the existing
//   incident+NO_RESULT-completion combo (already audited, left alone) is
//   the correct path for a match that can't continue; once completed/
//   finalized, cancellation makes no sense. Reuses MATCH_NOT_ELIGIBLE
//   rather than inventing a new error code for this.
// - Idempotent: re-cancelling an already-cancelled match is a clean no-op,
//   matching completeMatchManually's own transitioned:false precedent —
//   never a 409 on a harmless retry.
// - No timing threshold beyond "still upcoming" — explicit product
//   assumption, reported per the brief's own instruction rather than
//   invented silently. In particular this does NOT reuse the 24h
//   assignment lock (umpireAssignment.service.js#cancelAssignment): that
//   lock exists to stop an UMPIRE quietly backing out at the last minute,
//   not to stop the GROUND OWNER from cancelling a match that genuinely
//   cannot go ahead — bad weather discovered hours before kickoff is
//   exactly when this is most needed, so blocking it here would be actively
//   harmful, not safer.
export async function cancelGroundMatch(ground, matchId, actingUserId, reason = null) {
  const match = await resolveOwnedMatch(ground, matchId)
  if (match.status === 'cancelled') return { match, transitioned: false }
  if (match.status !== 'upcoming') {
    throw new UmpireAssignmentError(CODES.MATCH_NOT_ELIGIBLE, `Cannot cancel a match that is '${match.status}' — only an upcoming match can be cancelled.`)
  }
  const trimmedReason = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 280) : null

  // Slot ids fetched before the transaction — a plain read, and no other
  // path adds/removes slot ROWS for an existing match (only their status
  // changes), so this can't race against what the transaction below does.
  const allSlots = await findSlotsByMatch(matchId)

  const client = await pool.connect()
  let updated
  let cancelledSlots
  let expiredProposals = []
  try {
    await client.query('BEGIN')
    updated = await updateMatch(
      matchId,
      { status: 'cancelled', cancelled_at: new Date(), cancelled_by: actingUserId, cancellation_reason: trimmedReason },
      client,
    )
    // Releases every ASSIGNED umpire's availability for this match — see
    // cancelAllAssignedSlotsForMatch's own comment for why this does NOT
    // also write an umpire_assignment_events 'CANCELLED' row.
    cancelledSlots = await cancelAllAssignedSlotsForMatch(matchId, trimmedReason, client)
    // Every PENDING proposal on every slot (ASSIGNED or still-open) is
    // invalidated — a proposal for a match that no longer exists must never
    // be accept-able. Reuses the exact same bulk-expire function
    // applyForSlot/respondToProposal already use when a slot fills.
    for (const slot of allSlots) {
      expiredProposals.push(...(await expirePendingProposalsForSlot(slot.id, null, client)))
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  // Best-effort, post-commit — same posture as every other notification in
  // this codebase.
  const withTeams = await findMatchByIdWithTeams(matchId)
  const matchLabel = withTeams ? `${withTeams.team_a_name} vs ${withTeams.team_b_name}` : 'your match'
  await Promise.all([
    ...cancelledSlots
      .filter((s) => s.umpire_user_id)
      .map((s) =>
        createNotification({
          userId: s.umpire_user_id,
          type: 'MATCH_CANCELLED',
          title: 'A match you were assigned to was cancelled',
          body: trimmedReason ? `${matchLabel} — ${trimmedReason}` : matchLabel,
          relatedMatchId: matchId,
        }),
      ),
    // Same UMPIRE_PROPOSAL_EXPIRED type applyForSlot/respondToProposal
    // already use for "this opportunity is gone" — reused, not invented
    // twice, for the pending-proposal (not yet accepted) group.
    ...expiredProposals.map((p) =>
      createNotification({
        userId: p.umpire_user_id,
        type: 'UMPIRE_PROPOSAL_EXPIRED',
        title: 'That match was cancelled',
        body: matchLabel,
        relatedMatchId: matchId,
      }),
    ),
  ])

  return { match: updated, transitioned: true, cancelledSlots }
}

// Verifies the target slot belongs to THIS match (never trust a slot id
// alone — a ground owner could otherwise probe/act on any slot id from any
// match) and is in the expected current status. 404, not 409, when the slot
// doesn't belong to the match — same "don't even confirm it exists"
// posture resolveOwnedMatch uses for cross-ground matches.
async function resolveEligibleSlot(matchId, slotId, expectedStatus) {
  const slot = await findSlotById(slotId)
  if (!slot || slot.match_id !== matchId) {
    throw new UmpireAssignmentError(CODES.SLOT_NOT_FOUND, 'Umpire slot not found for this match.')
  }
  if (slot.status !== expectedStatus) {
    throw new UmpireAssignmentError(CODES.SLOT_NOT_ELIGIBLE, `This slot is '${slot.status}', not '${expectedStatus}'.`)
  }
  return slot
}

// No-show (Workstream F) — only an authorized ground owner of the match's
// own ground, only while the match hasn't reached a terminal state, only a
// currently ASSIGNED slot. Marking a slot NO_SHOW while the match is still
// 'live' immediately revokes that umpire's scoring access (requireMatchScorer
// re-checks hasActiveSlotAssignment live), which is the intended effect —
// an absent umpire shouldn't retain scoring rights.
export async function markMatchUmpireNoShow(ground, matchId, slotId, actingUserId) {
  const match = await resolveOwnedMatch(ground, matchId)
  if (match.status !== 'upcoming' && match.status !== 'live') {
    throw new UmpireAssignmentError(CODES.MATCH_NOT_ELIGIBLE, `Cannot mark a no-show on a match that is '${match.status}'.`)
  }
  const slot = await resolveEligibleSlot(matchId, slotId, 'ASSIGNED')
  const noShowUmpireId = slot.umpire_user_id

  const client = await pool.connect()
  let updated
  try {
    await client.query('BEGIN')
    updated = await markSlotNoShowModel(slotId, client)
    if (!updated) {
      throw new UmpireAssignmentError(CODES.SLOT_NOT_ELIGIBLE, 'This slot is no longer ASSIGNED.')
    }
    await insertAssignmentEvent({ slotId, matchId, umpireUserId: noShowUmpireId, eventType: 'NO_SHOW', recordedBy: actingUserId }, client)
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  const withTeams = await findMatchByIdWithTeams(matchId)
  await createNotification({
    userId: noShowUmpireId,
    type: 'UMPIRE_NO_SHOW',
    title: 'You were marked as a no-show',
    body: `You were marked as a no-show for ${withTeams.team_a_name} vs ${withTeams.team_b_name}.`,
    relatedMatchId: matchId,
  })

  return updated
}

// Candidate pool for a NO_SHOW slot — approved, no conflicting match,
// available, not already actively assigned to THIS match, and not the
// no-show umpire themselves (a "find replacement" flow offering someone as
// their own replacement is confusing UX, not a real replacement — the
// no-show umpire otherwise passes every one of these checks, since their own
// slot is no longer ASSIGNED). Reuses the exact same overlap/availability
// logic assertUmpireEligibleForMatch enforces at write time, as a filter
// instead of a throw, so this list can never show a candidate the actual
// replace call would then reject.
//
// Phase 24 — the per-candidate eligibility checks run CONCURRENTLY across
// candidates (Promise.all over the whole candidate list) instead of
// one-candidate-at-a-time in a sequential for-loop — a confirmed N+1 the
// previous phase left as a known gap — and each surviving candidate gets a
// `reputation` summary via ONE batched call at the end, never per-candidate.
//
// Umpire Intelligence & Scale 2.0 — the eligibility-filtering logic itself
// now lives in umpireEligibility.service.js#findEligibleUmpireCandidates
// (extracted, behavior-unchanged) so the new recommendation engine reuses
// the identical pipeline instead of a second implementation.
export async function listEligibleReplacements(ground, matchId, slotId) {
  const match = await resolveOwnedMatch(ground, matchId)
  const slot = await resolveEligibleSlot(matchId, slotId, 'NO_SHOW')

  const eligible = await findEligibleUmpireCandidates(match, { excludeUserId: slot.umpire_user_id })

  const summaries = await buildReputationSummaries(eligible.map((c) => c.id))
  return eligible.map((c) => ({ id: c.id, name: c.name, reputation: summaries.get(c.id) || null }))
}

// Replacement (Workstream G) — the new umpire goes through the EXACT same
// eligibility gate applyForSlot uses (assertUmpireEligibleForMatch: approved,
// overlap, availability), never a bare guarded UPDATE, so a ground-owner-
// initiated replacement can never bypass the protections U10/Phase 23-A
// already established for self-service assignment.
export async function assignReplacementUmpire(ground, matchId, slotId, newUmpireUserId, actingUserId) {
  const match = await resolveOwnedMatch(ground, matchId)
  if (match.status !== 'upcoming' && match.status !== 'live') {
    throw new UmpireAssignmentError(CODES.MATCH_NOT_ELIGIBLE, `Cannot assign a replacement on a match that is '${match.status}'.`)
  }
  await resolveEligibleSlot(matchId, slotId, 'NO_SHOW')

  const candidate = await findUserById(newUmpireUserId)
  if (!candidate) throw new UmpireAssignmentError(CODES.MATCH_NOT_FOUND, 'Replacement umpire not found.')

  const client = await pool.connect()
  let slot
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1)', [newUmpireUserId])

    await assertUmpireEligibleForMatch(match, candidate, client)

    // Same idx_match_umpire_slots_active_umpire race guard applyForSlot/
    // respondToProposal already handle — the eligibility gate above only
    // checks CROSS-match overlap, so this catches the same-match case (e.g.
    // the replacement candidate already holds the match's other slot).
    try {
      slot = await assignReplacementToSlot(slotId, newUmpireUserId, client)
    } catch (err) {
      if (err.code === '23505') {
        throw new UmpireAssignmentError(CODES.ALREADY_ASSIGNED, 'This umpire is already assigned to another slot on this match.')
      }
      throw err
    }
    if (!slot) {
      throw new UmpireAssignmentError(CODES.SLOT_NOT_ELIGIBLE, 'This slot is no longer NO_SHOW.')
    }
    await insertAssignmentEvent(
      { slotId, matchId, umpireUserId: newUmpireUserId, eventType: 'REPLACEMENT_ASSIGNED', recordedBy: actingUserId },
      client,
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  const withTeams = await findMatchByIdWithTeams(matchId)
  const matchLabel = `${withTeams.team_a_name} vs ${withTeams.team_b_name}`
  await Promise.all([
    createNotification({
      userId: newUmpireUserId,
      type: 'UMPIRE_REPLACEMENT_ASSIGNED',
      title: "You're now assigned as a replacement umpire",
      body: matchLabel,
      relatedMatchId: matchId,
    }),
  ])

  return slot
}

// Replacement/assignment history (Workstream H) — the lightweight read
// umpire_assignment_events exists for: every ASSIGNED/CANCELLED/NO_SHOW/
// REPLACEMENT_ASSIGNED/COMPLETED event for this match, oldest first, with
// enough context to render a 3-line timeline per slot without a second
// round trip.
export async function getMatchAssignmentHistory(ground, matchId) {
  await resolveOwnedMatch(ground, matchId)
  const { rows } = await pool.query(
    `SELECT e.id, e.match_umpire_slot_id, e.event_type, e.recorded_at, e.umpire_user_id, u.name AS umpire_name
     FROM umpire_assignment_events e
     LEFT JOIN users u ON u.id = e.umpire_user_id
     WHERE e.match_id = $1
     ORDER BY e.recorded_at ASC`,
    [matchId],
  )
  return rows
}

// Ground-owner read path for incidents (Workstream I) — same
// findIncidentsByMatch model function the umpire-side GET /matches/:id/
// incidents route uses, just reused through the ground-scoped auth gate
// instead of requireMatchScorerByParam.
export async function getMatchIncidents(ground, matchId) {
  await resolveOwnedMatch(ground, matchId)
  return findIncidentsByMatch(matchId)
}

// Umpire Intelligence & Scale 2.0, Workstream J — "Umpire Operations" for
// the current ground-local calendar month. Every count derives from
// matches.match_date's own naive digits (already ground-local — see
// Communication 2.0), compared via plain EXTRACT(YEAR/MONTH) against the
// CURRENT ground-local calendar month, never a NOW()-vs-naive-column
// instant comparison (the exact bug class that phase fixed).
//
// "Understaffed starts" from the task's own example cannot be computed
// honestly: no column anywhere records whether a match was started while
// understaffed (confirmUnderstaffed is a transient request flag, never
// persisted — confirmed by inspecting match.service.js#startMatch). Rather
// than add a new column for one minor metric or silently approximate it,
// this reports the real, currently-computable equivalent instead:
// "currentlyUnderstaffedUpcoming" — upcoming matches this month that are
// understaffed as of right now. Disclosed, not silently renamed.
export async function getUmpireOperationsSummary(ground) {
  const { year, month } = utcToGroundLocalParts(new Date())

  const [{ rows: matchRows }, { rows: ratingRows }, { rows: noShowRows }] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS matches_this_month,
         COUNT(*) FILTER (
           WHERE m.required_umpires > 0
             AND (SELECT COUNT(*)::int FROM match_umpire_slots s WHERE s.match_id = m.id AND s.status = 'ASSIGNED') >= m.required_umpires
         )::int AS fully_staffed,
         COUNT(*) FILTER (
           WHERE m.status = 'upcoming'
             AND m.required_umpires > 0
             AND (SELECT COUNT(*)::int FROM match_umpire_slots s WHERE s.match_id = m.id AND s.status = 'ASSIGNED') < m.required_umpires
         )::int AS currently_understaffed_upcoming
       FROM matches m
       WHERE m.ground_id = $1 AND EXTRACT(YEAR FROM m.match_date) = $2 AND EXTRACT(MONTH FROM m.match_date) = $3`,
      [ground.id, year, month],
    ),
    pool.query(
      `SELECT AVG(rat.rating)::numeric(3,2) AS avg_rating, COUNT(*)::int AS rating_count
       FROM match_feedback_umpire_ratings rat
       JOIN match_feedback mf ON mf.id = rat.match_feedback_id
       JOIN matches m ON m.id = mf.match_id
       WHERE m.ground_id = $1 AND EXTRACT(YEAR FROM m.match_date) = $2 AND EXTRACT(MONTH FROM m.match_date) = $3`,
      [ground.id, year, month],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS no_show_count
       FROM umpire_assignment_events e
       JOIN matches m ON m.id = e.match_id
       WHERE m.ground_id = $1 AND e.event_type = 'NO_SHOW' AND EXTRACT(YEAR FROM m.match_date) = $2 AND EXTRACT(MONTH FROM m.match_date) = $3`,
      [ground.id, year, month],
    ),
  ])

  const match = matchRows[0]
  const rating = ratingRows[0]
  return {
    matchesThisMonth: match.matches_this_month,
    fullyStaffed: match.fully_staffed,
    currentlyUnderstaffedUpcoming: match.currently_understaffed_upcoming,
    avgUmpireRating: rating.rating_count >= GROUND_RATING_MIN_SAMPLE ? Number(rating.avg_rating) : null,
    ratingSampleSize: rating.rating_count,
    noShowCount: noShowRows[0].no_show_count,
  }
}

// Phase 9 — Ground Owner Operations Dashboard. Reuses groundDashboard.service.js
// (staff dashboard) but adapted for ground owner perspective. Owner needs the
// same today/upcoming visibility but MAY get additional owner-specific data
// (e.g., revenue estimates, staff scheduling) in future phases.
export async function getGroundOwnerDashboard(groundId) {
  const today = groundTodayDateStr()
  const dayStart = groundLocalToUtc(today, 0, 0)
  const dayEnd = groundLocalToUtc(today, 24, 0)
  const weekEnd = groundLocalToUtc(addDaysToDateStr(today, 7), 24, 0)

  const [timeline, todayRows, todayMatches, upcomingBlocks, upcomingMatches, availabilitySlots, canteens, staffCounts] = await Promise.all([
    getDailyTimeline(today),
    bookingRepo.listConfirmedInRange(dayStart, dayEnd, groundId),
    bookingRepo.listMatchEntriesInRange(today, addDaysToDateStr(today, 1), groundId),
    bookingRepo.listBlocksInRange(dayEnd, weekEnd, groundId),
    bookingRepo.listMatchEntriesInRange(addDaysToDateStr(today, 1), addDaysToDateStr(today, 7), groundId),
    getDayAvailability(today, { isStaff: true, groundId }),
    findCanteensByGroundId(groundId),
    countStaffByRoleAndStatus(groundId),
  ])

  const todayBookings = todayRows.filter((r) => r.booking_type === 'CUSTOMER')
  const todayBlocks = todayRows.filter((r) => r.booking_type === 'STAFF_BLOCK')

  // Phase 16 — current/next booking derived from the already-fetched
  // today.bookings list (no new query) — "now" compared against each
  // booking's own start/end.
  const now = new Date()
  const currentBooking = todayBookings.find((r) => new Date(r.start_time) <= now && now < new Date(r.end_time)) || null
  const nextBooking = todayBookings
    .filter((r) => new Date(r.start_time) > now)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0] || null

  // Phase 16 — canteen operational snapshot, summed across every canteen
  // on this ground (a ground can have more than one — Step 18). Reuses the
  // exact revenue/status/top-selling functions Phase 14/16 already built,
  // never a second, divergent calculation.
  let canteenSnapshot = { ordersByStatus: {}, revenue: 0, orderCount: 0, topItems: [], lowStockItems: [] }
  if (canteens.length > 0) {
    const [statusRows, revenueResult, topItems] = await Promise.all([
      countOrdersByStatusForGround(groundId, dayStart, dayEnd),
      sumCompletedRevenueForGround(groundId, dayStart, dayEnd),
      topSellingItemsForGround(groundId, dayStart, dayEnd, 5),
    ])
    const ordersByStatus = {}
    for (const row of statusRows) ordersByStatus[row.status] = row.count
    const lowStockItems = []
    for (const canteen of canteens) {
      const items = await lowStockItemsForCanteen(canteen.id, 5)
      for (const item of items) lowStockItems.push({ name: item.name, stock: item.stock })
    }
    canteenSnapshot = {
      ordersByStatus,
      revenue: revenueResult.revenue,
      orderCount: revenueResult.orderCount,
      topItems: topItems.map((r) => ({ name: r.item_name, quantitySold: r.quantity_sold })),
      lowStockItems,
    }
  }

  // Phase 16 — staff summary from the single GROUP BY countStaffByRoleAndStatus.
  let activeStaff = 0
  let inactiveStaff = 0
  const roleBreakdown = {}
  for (const row of staffCounts) {
    if (row.is_active) activeStaff += row.count
    else inactiveStaff += row.count
    roleBreakdown[row.role] = (roleBreakdown[row.role] || 0) + row.count
  }

  return {
    date: today,
    groundStatus: todayMatches.length > 0 ? 'MATCH_DAY' : todayBlocks.length > 0 ? 'PARTIALLY_BLOCKED' : todayBookings.length > 0 ? 'BOOKED' : 'OPEN',
    today: {
      bookingsCount: todayBookings.length,
      blocksCount: todayBlocks.length,
      matchesCount: todayMatches.length,
      bookings: todayBookings.map((r) => ({ publicBookingId: r.public_booking_id, startTime: r.start_time, endTime: r.end_time, purpose: r.purpose })),
      blocks: todayBlocks.map((r) => ({ publicBookingId: r.public_booking_id, startTime: r.start_time, endTime: r.end_time, blockType: r.block_type })),
      matches: todayMatches.map((m) => ({
        matchId: m.id,
        teamA: m.team_a_name,
        teamB: m.team_b_name,
        status: m.status,
        tournamentName: m.tournament_name,
        stage: m.stage,
      })),
      timeline: timeline.segments,
      currentBooking: currentBooking && { publicBookingId: currentBooking.public_booking_id, startTime: currentBooking.start_time, endTime: currentBooking.end_time },
      nextBooking: nextBooking && { publicBookingId: nextBooking.public_booking_id, startTime: nextBooking.start_time, endTime: nextBooking.end_time },
      availableSlotsCount: availabilitySlots.filter((s) => s.status === 'AVAILABLE').length,
      blockedSlotsCount: availabilitySlots.filter((s) => s.status !== 'AVAILABLE').length,
    },
    upcoming7Days: {
      blocks: upcomingBlocks.map((r) => ({ publicBookingId: r.public_booking_id, startTime: r.start_time, endTime: r.end_time, blockType: r.block_type })),
      matches: upcomingMatches.map((m) => ({
        matchId: m.id,
        teamA: m.team_a_name,
        teamB: m.team_b_name,
        matchDate: m.match_date,
        tournamentName: m.tournament_name,
      })),
    },
    canteen: canteenSnapshot,
    staff: { active: activeStaff, inactive: inactiveStaff, roleBreakdown },
  }
}
