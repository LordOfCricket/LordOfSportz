// Phase 12 — the ONE orchestrator that turns an innings' authoritative
// delivery/event log into an ordered, deterministic commentary projection.
// Pure: no pg, no I/O, no Socket.IO — exactly like domain/scoring/replay.js,
// which is the ONLY thing this file trusts for cricket facts (it re-derives
// nothing: strike rotation, extras math, dismissal attribution, over
// completion, milestone totals are all read straight off replayInnings()
// output). "Commentary describes cricket, it does not decide cricket."
//
// Called the same way for BOTH a normal delivery (the caller then persists
// only the tail entries whose sourceIndex is the newest log entry — an
// "append") and a historical correction (the caller deletes and re-persists
// EVERY entry for this innings — a "resync"). Both callers get byte-identical
// output for byte-identical log prefixes, because this is a pure function of
// (log, seed, format, roster, teamNames, match) — there is no hidden,
// incrementally-mutated context to drift between the two call sites.
import { replayInnings, dismissedPlayerId } from '../scoring/replay.js'
import { BOWLER_CREDITED_DISMISSALS } from '../scoring/eventTypes.js'
import { buildDeliveryCommentary } from './buildDeliveryCommentary.js'
import { buildWicketCommentary } from './buildWicketCommentary.js'
import { buildEventCommentary } from './buildEventCommentary.js'
import { buildBatsmanMilestoneText, buildBowlerMilestoneText, buildPartnershipMilestoneText, crossedThreshold } from './buildMilestoneCommentary.js'
import {
  buildOverEndText,
  buildMaidenText,
  buildInningsEndText,
  buildInningsBreakText,
  buildInningsStartText,
  buildMatchResultText,
} from './buildLifecycleCommentary.js'

function resolvePlayer(roster, matchPlayerId) {
  if (matchPlayerId == null) return null
  return roster.get(matchPlayerId) || null
}

function makeEntry({ sourceIndex, entryKey, type, text, tags = [], sourceDeliveryId = null, sourceEventId = null, over = null, ball = null, scoreRuns = null, scoreWickets = null }) {
  return {
    sourceIndex,
    entryKey,
    type,
    text,
    tags,
    sourceDeliveryId,
    sourceEventId,
    overNumber: over,
    ballInOver: ball,
    ballLabel: over != null && ball != null ? `${over}.${ball}` : null,
    scoreRuns,
    scoreWickets,
  }
}

function commentaryForDelivery({ index, before, after, roster, shotsByDeliveryId, milestonesSeen, battingTeamName }) {
  const d = after.deliveries[after.deliveries.length - 1]
  const out = []
  if (d.voided || d.isDeadBall) return out

  const striker = resolvePlayer(roster, d.strikerMatchPlayerId)
  const bowler = resolvePlayer(roster, d.bowlerMatchPlayerId)
  const shot = shotsByDeliveryId.get(String(d.id))
  const regionId = shot?.region_id || null

  if (d.wicket) {
    const dismissed = resolvePlayer(roster, dismissedPlayerId(d))
    const fielder = resolvePlayer(roster, d.wicket.fielderMatchPlayerId)
    const secondaryFielder = resolvePlayer(roster, d.wicket.secondaryFielderMatchPlayerId)
    const wc = buildWicketCommentary({ delivery: d, wicket: d.wicket, dismissedPlayer: dismissed, bowler, fielder, secondaryFielder })
    if (wc) out.push(makeEntry({ sourceIndex: index, entryKey: `d:${d.id}`, type: 'WICKET', text: wc.text, tags: wc.tags, sourceDeliveryId: d.id, over: d.over, ball: d.ball, scoreRuns: after.runs, scoreWickets: after.wickets }))
  } else {
    const dc = buildDeliveryCommentary({ delivery: d, striker, bowler, regionId })
    if (dc) out.push(makeEntry({ sourceIndex: index, entryKey: `d:${d.id}`, type: 'DELIVERY', text: dc.text, tags: dc.tags, sourceDeliveryId: d.id, over: d.over, ball: d.ball, scoreRuns: after.runs, scoreWickets: after.wickets }))
  }

  // Batsman milestones (Part 19/20) — fires exactly once, the ball the total crosses.
  if (d.strikerMatchPlayerId != null) {
    const beforeRuns = before.batsmen[d.strikerMatchPlayerId]?.runs ?? 0
    const afterRuns = after.batsmen[d.strikerMatchPlayerId]?.runs ?? 0
    for (const threshold of [50, 100]) {
      const key = `bm:${d.strikerMatchPlayerId}:${threshold}`
      if (milestonesSeen.has(key)) continue
      if (crossedThreshold(beforeRuns, afterRuns, threshold)) {
        milestonesSeen.add(key)
        out.push(
          makeEntry({
            sourceIndex: index,
            entryKey: `m:${d.id}:${threshold}:${d.strikerMatchPlayerId}`,
            type: 'MILESTONE',
            text: buildBatsmanMilestoneText(striker?.name || 'The batsman', threshold),
            tags: [threshold === 50 ? 'FIFTY' : 'HUNDRED'],
            sourceDeliveryId: d.id,
            over: d.over,
            ball: d.ball,
            scoreRuns: after.runs,
            scoreWickets: after.wickets,
          })
        )
      }
    }
  }

  // Bowler wicket-haul milestones (Part 21) — only for dismissals credited to the bowler.
  if (d.wicket && BOWLER_CREDITED_DISMISSALS.includes(d.wicket.type) && d.bowlerMatchPlayerId != null) {
    const beforeW = before.bowlers[d.bowlerMatchPlayerId]?.wickets ?? 0
    const afterW = after.bowlers[d.bowlerMatchPlayerId]?.wickets ?? 0
    for (const threshold of [3, 5]) {
      const key = `bw:${d.bowlerMatchPlayerId}:${threshold}`
      if (milestonesSeen.has(key)) continue
      if (crossedThreshold(beforeW, afterW, threshold)) {
        milestonesSeen.add(key)
        out.push(
          makeEntry({
            sourceIndex: index,
            entryKey: `m:${d.id}:wkts${threshold}:${d.bowlerMatchPlayerId}`,
            type: 'MILESTONE',
            text: buildBowlerMilestoneText(bowler?.name || 'The bowler', threshold),
            tags: ['BOWLER_MILESTONE'],
            sourceDeliveryId: d.id,
            over: d.over,
            ball: d.ball,
            scoreRuns: after.runs,
            scoreWickets: after.wickets,
          })
        )
      }
    }
  }

  // Partnership milestones (Part 22) — the CURRENT (possibly just-closed) pair.
  {
    const pairIds = after.partnership.batsmen
    const pairKey = pairIds.length === 2 ? pairIds.map(String).sort().join('-') : null
    const beforePairKey = before.partnership.batsmen.length === 2 ? before.partnership.batsmen.map(String).sort().join('-') : null
    const beforeP = pairKey && pairKey === beforePairKey ? before.partnership.runs : 0
    const afterP = after.partnership.runs
    if (pairKey) {
      for (const threshold of [50, 100]) {
        const key = `p:${pairKey}:${threshold}`
        if (milestonesSeen.has(key)) continue
        if (crossedThreshold(beforeP, afterP, threshold)) {
          milestonesSeen.add(key)
          const names = pairIds.map((id) => resolvePlayer(roster, id)?.name || 'Batsman').join(' and ')
          out.push(
            makeEntry({
              sourceIndex: index,
              entryKey: `m:${d.id}:partnership${threshold}`,
              type: 'MILESTONE',
              text: buildPartnershipMilestoneText(names, threshold),
              tags: ['PARTNERSHIP_MILESTONE'],
              sourceDeliveryId: d.id,
              over: d.over,
              ball: d.ball,
              scoreRuns: after.runs,
              scoreWickets: after.wickets,
            })
          )
        }
      }
    }
  }

  // Over end (Part 17/18) — fires exactly on the ball that completes the over.
  if (d.isLegalDelivery && after.legalBalls % after.ballsPerOver === 0) {
    const overNum = d.over
    const overDeliveries = after.deliveries.filter((dd) => dd.over === overNum && !dd.voided)
    out.push(
      makeEntry({
        sourceIndex: index,
        entryKey: `oe:${overNum}`,
        type: 'OVER_END',
        text: buildOverEndText(overNum, battingTeamName, after.runs, after.wickets),
        tags: ['OVER_END'],
        over: overNum,
        ball: after.ballsPerOver,
        scoreRuns: after.runs,
        scoreWickets: after.wickets,
      })
    )
    const maiden = overDeliveries.length > 0 && overDeliveries.reduce((s, dd) => s + dd.totalRuns, 0) === 0
    if (maiden) {
      const overBowler = overDeliveries[0]?.bowlerMatchPlayerId
      out.push(
        makeEntry({
          sourceIndex: index,
          entryKey: `oe:${overNum}:maiden`,
          type: 'OVER_END',
          text: buildMaidenText(resolvePlayer(roster, overBowler)?.name || 'The bowler'),
          tags: ['MAIDEN'],
          over: overNum,
          ball: after.ballsPerOver,
          scoreRuns: after.runs,
          scoreWickets: after.wickets,
        })
      )
    }
  }

  return out
}

function commentaryForEvent({ index, before, after, roster }) {
  const e = after.events[after.events.length - 1]
  if (e.voided) return []

  let batsman = null
  let fielder = null
  if (e.eventType === 'catch-dropped') {
    batsman = resolvePlayer(roster, before.ends.strikerEnd)
    fielder = resolvePlayer(roster, e.payload?.fielderMatchPlayerId)
  } else if (e.eventType === 'retire') {
    batsman = resolvePlayer(roster, e.payload?.matchPlayerId)
  }

  const ec = buildEventCommentary({ event: e, batsman, fielder })
  if (!ec) return []
  return [
    makeEntry({
      sourceIndex: index,
      entryKey: `e:${e.id}`,
      type: 'MATCH_EVENT',
      text: ec.text,
      tags: ec.tags,
      sourceEventId: e.id,
      over: e.over,
      ball: e.ball,
      scoreRuns: after.runs,
      scoreWickets: after.wickets,
    }),
  ]
}

/**
 * @param {object} params
 * @param {Array} params.log - loadInningsLog() output (log_sequence-ordered delivery+event entries)
 * @param {object} params.seed - { battingTeamId, bowlingTeamId } (scoring.service.js#seedFrom)
 * @param {object} params.format - { oversPerInnings, ballsPerOver, battingTeamPlayingXiCount, target }
 * @param {object} params.innings - the innings DB row (id, innings_number, batting_team_id, bowling_team_id, status)
 * @param {Map} params.roster - matchPlayerId -> { name, publicPlayerId }
 * @param {Map} params.shotsByDeliveryId - String(deliveryId) -> wagon_wheel_shots row
 * @param {{[teamId: number]: string}} params.teamNames
 * @param {object|null} params.match - { id, status, result, result_type, result_margin, winner_team_id } — only read for MATCH_RESULT text (Part 26), never recomputed
 * @returns {Array} ordered commentary entries, each tagged with `sourceIndex` (position in `log`) — the caller decides what to persist
 */
export function generateInningsCommentary({ log, seed, format, innings, roster, shotsByDeliveryId, teamNames, match }) {
  const entries = []
  const milestonesSeen = new Set()

  // Second-innings (chase) start (Part 25) — a lifecycle fact independent of
  // any single log entry, so it's emitted up front rather than attached to ball one.
  if (innings.innings_number > 1 && format.target != null) {
    const chasingTeamName = teamNames?.[innings.batting_team_id] || 'The batting side'
    entries.push(makeEntry({ sourceIndex: -1, entryKey: `is:${innings.id}`, type: 'MATCH_EVENT', text: buildInningsStartText(chasingTeamName, format.target), tags: ['INNINGS_START'] }))
  }

  const battingTeamName = teamNames?.[innings.batting_team_id] || 'The batting side'

  for (let i = 0; i < log.length; i++) {
    const before = replayInnings(log.slice(0, i), seed, format)
    const after = replayInnings(log.slice(0, i + 1), seed, format)
    const produced =
      log[i].kind === 'delivery'
        ? commentaryForDelivery({ index: i, before, after, roster, shotsByDeliveryId, milestonesSeen, battingTeamName })
        : commentaryForEvent({ index: i, before, after, roster })
    entries.push(...produced)
  }

  const finalState = replayInnings(log, seed, format)
  const isComplete = finalState.isAllOut || finalState.isOversComplete || finalState.isTargetChased || ['completed', 'declared', 'forfeited'].includes(innings.status)
  if (isComplete) {
    entries.push(
      makeEntry({
        sourceIndex: log.length - 1,
        entryKey: `ie:${innings.id}`,
        type: 'INNINGS_END',
        text: buildInningsEndText(battingTeamName, finalState.runs, finalState.wickets, finalState.isAllOut),
        tags: finalState.isAllOut ? ['ALL_OUT'] : [],
        scoreRuns: finalState.runs,
        scoreWickets: finalState.wickets,
      })
    )

    if (innings.innings_number < 2) {
      const chasingTeamName = teamNames?.[innings.bowling_team_id] || 'The chasing side'
      const target = finalState.runs + 1
      entries.push(
        makeEntry({ sourceIndex: log.length - 1, entryKey: `ib:${innings.id}`, type: 'INNINGS_BREAK', text: buildInningsBreakText(chasingTeamName, target), scoreRuns: finalState.runs, scoreWickets: finalState.wickets })
      )
    } else if (match?.result_type) {
      entries.push(
        makeEntry({
          sourceIndex: log.length - 1,
          entryKey: `mr:${match.id}`,
          type: 'MATCH_RESULT',
          text: buildMatchResultText(match.result),
          tags: ['RESULT'],
          scoreRuns: finalState.runs,
          scoreWickets: finalState.wickets,
        })
      )
    }
  }

  return entries.map((e, idx) => ({ ...e, sequence: idx + 1 }))
}
