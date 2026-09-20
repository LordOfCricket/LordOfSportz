// Phase 16 — orchestrates AI Match/Player/Team Insight:
//
// PostgreSQL (authoritative) -> existing services (matchSummary/statistics/
// publicTeam, all UNCHANGED) -> domain/ai context builders (pure) ->
// AI provider (server-only) -> structured-output validation -> PostgreSQL
// `ai_insights` cache (MongoDB cleanup, Phase 2 — was MongoDB before) -> API DTO.
//
// Non-negotiables enforced here, not hoped-for:
//  - AI is NEVER on the critical path of any existing read — a provider
//    failure/timeout/misconfiguration only ever produces
//    `{available:false, reason}`, never a thrown error the controller has
//    to turn into a 500 (Part 25).
//  - AI output is validated, then POST-PROCESSED to strip any key-moment
//    candidateId or player id the model referenced that isn't actually in
//    the supplied context (Part 11/48) — never trusted blindly.
//  - AI never writes to any cricket-authoritative PostgreSQL table, ever.
//    The only write this file performs is an upsert into the `ai_insights`
//    cache table — itself never a source of cricket truth (README
//    principle #4/#9), just colocated with the facts it narrates since
//    Phase 2.
//  - A finalized match / a player or team with zero eligible data never
//    gets a fabricated insight (Part 24/38/39) — returns INSUFFICIENT_DATA.

import { findAiInsight, upsertAiInsight } from '../models/aiInsight.model.js'
import * as aiProvider from '../ai/aiProvider.js'
import { validateStructuredOutput } from '../domain/ai/validateStructuredOutput.js'
import { computeSourceFingerprint } from '../domain/ai/computeSourceFingerprint.js'
import { buildMatchAIContext } from '../domain/ai/buildMatchAIContext.js'
import { buildPlayerAIContext } from '../domain/ai/buildPlayerAIContext.js'
import { buildTeamAIContext } from '../domain/ai/buildTeamAIContext.js'
import { buildUmpireAIContext } from '../domain/ai/buildUmpireAIContext.js'
import { MATCH_INSIGHT_SCHEMA } from '../ai/schemas/matchInsightSchema.js'
import { PERSON_INSIGHT_SCHEMA } from '../ai/schemas/personInsightSchema.js'
import { MATCH_INSIGHT_SYSTEM_PROMPT, PLAYER_INSIGHT_SYSTEM_PROMPT, TEAM_INSIGHT_SYSTEM_PROMPT, UMPIRE_INSIGHT_SYSTEM_PROMPT } from '../ai/prompts/systemPrompts.js'

import * as matchSummaryService from './matchSummary.service.js'
import * as scoringService from './scoring.service.js'
import * as commentaryRepo from '../repositories/commentary.repository.js'
import * as statisticsService from './statistics.service.js'
import * as publicTeamService from './publicTeam.service.js'
import { findPlayerByPublicId } from '../models/player.model.js'
import { buildReputationSummary } from './umpireReputation.service.js'
import { findMonthlyOfficiatingTrend } from '../models/umpireTrend.model.js'
import { logger } from '../utils/logger.js'

// Part 29 — bounded, in-process single-flight de-dup: N spectators hitting
// the same finalized Match Summary at once trigger exactly one provider
// call, not N. Deliberately not Redis (Part 29's own instruction) — this is
// a single Node process, same scope every other in-memory cache in this
// codebase (e.g. utils/cache.js) already assumes.
const inFlight = new Map()

function notFound(message) {
  const err = new Error(message)
  err.statusCode = 404
  return err
}

function postProcessMatchInsight(parsed, facts) {
  const candidateById = new Map(facts.candidateKeyMoments.map((c) => [c.candidateId, c]))
  const allowedPlayers = new Set(facts.allowedPlayerIds)
  return {
    headline: parsed.headline,
    summary: parsed.summary,
    keyMoments: parsed.keyMoments
      .filter((km) => candidateById.has(km.candidateId))
      .map((km) => {
        const c = candidateById.get(km.candidateId)
        return { type: c.type, inningsNumber: c.inningsNumber, ballLabel: c.ballLabel, label: c.label, deliveryId: c.deliveryId, eventId: c.eventId, explanation: km.explanation }
      }),
    standoutPerformers: parsed.standoutPerformers.filter((p) => allowedPlayers.has(p.publicPlayerId)),
  }
}

/** The shared engine behind all three insight kinds. `provider` is
 * injectable (defaults to the real one) purely so integration tests can
 * pass a fake — see tests/integration/aiInsight.integration.test.js. */
async function getOrGenerate({ sourceType, sourceId, buildFacts, systemPrompt, taskInstruction, schema, postProcess }, { forceRegenerate = false, provider = aiProvider } = {}) {
  const built = await buildFacts()
  if (!built) return { available: false, reason: 'INSUFFICIENT_DATA' }

  const { facts, fingerprintInput } = built
  const fingerprint = computeSourceFingerprint(fingerprintInput)

  // PostgreSQL is a hard dependency for this whole app (connectPostgres()
  // exits the process on failure — see config/db.js) — unlike the retired
  // Mongo-backed version, there's no "cache store temporarily unavailable"
  // gate needed here: if the process is running, ai_insights is reachable.
  if (!forceRegenerate) {
    const cached = await findAiInsight({ sourceType, sourceId })
    if (cached && cached.source_fingerprint === fingerprint) {
      return { available: true, insight: cached.payload, generatedAt: cached.generated_at, model: cached.model, stale: false, cached: true }
    }
  }

  if (!provider.isAIConfigured()) {
    return { available: false, reason: 'NOT_CONFIGURED' }
  }

  const key = `${sourceType}:${sourceId}`
  if (inFlight.has(key)) return inFlight.get(key)

  const generation = (async () => {
    try {
      const raw = await provider.generateStructuredInsight({ systemPrompt, factsPayload: facts, taskInstruction, schema })
      let parsed
      try {
        parsed = JSON.parse(raw.raw)
      } catch {
        logger.warn('AI insight generation failed: model output was not valid JSON', { sourceType, sourceId })
        return { available: false, reason: 'INVALID_OUTPUT' }
      }
      const { valid } = validateStructuredOutput(parsed, schema)
      if (!valid) {
        logger.warn('AI insight generation failed: model output did not match the expected schema', { sourceType, sourceId })
        return { available: false, reason: 'INVALID_OUTPUT' }
      }

      const cleaned = postProcess ? postProcess(parsed, facts) : parsed
      const generatedAt = new Date()

      await upsertAiInsight({
        sourceType,
        sourceId,
        sourceFingerprint: fingerprint,
        provider: process.env.AI_PROVIDER || 'anthropic',
        model: raw.model,
        payload: cleaned,
        generatedAt,
      })
      return { available: true, insight: cleaned, generatedAt, model: raw.model, stale: false, cached: false }
    } catch (err) {
      const reason = err.code === 'AI_NOT_CONFIGURED' ? 'NOT_CONFIGURED' : err.code === 'AI_REFUSAL' ? 'DECLINED' : 'PROVIDER_ERROR'
      if (reason === 'PROVIDER_ERROR') {
        logger.error('AI provider request failed', { sourceType, sourceId, error: err.message })
      }
      return { available: false, reason }
    } finally {
      inFlight.delete(key)
    }
  })()
  inFlight.set(key, generation)
  return generation
}

export async function getMatchInsight(matchId, opts = {}) {
  return getOrGenerate(
    {
      sourceType: 'MATCH',
      sourceId: matchId,
      buildFacts: async () => {
        const summary = await matchSummaryService.getMatchSummary(matchId) // 404s if the match itself doesn't exist
        // Part 24 — generated primarily for FINALIZED matches (isOfficial === status === 'finalized').
        if (!summary.match.isOfficial) return null
        const [commentaryRows, inningsRows] = await Promise.all([commentaryRepo.listByMatch(matchId), scoringService.listInningsByMatch(matchId)])
        const facts = buildMatchAIContext(summary, commentaryRows)
        // Fingerprints on innings.version (Part 22) — the SAME counter every
        // scoring correction already bumps — so ANY correction invalidates
        // the cached insight, even one that leaves final totals unchanged
        // (e.g. correcting who took a catch).
        const fingerprintInput = {
          matchId: summary.match.id,
          status: summary.match.status,
          resultType: summary.result?.resultType ?? null,
          winnerTeamName: summary.result?.winnerTeamId ?? null,
          inningsVersions: inningsRows.map((i) => ({ id: i.id, version: i.version })),
        }
        return { facts, fingerprintInput }
      },
      systemPrompt: MATCH_INSIGHT_SYSTEM_PROMPT,
      taskInstruction: 'Write the match insight now, as a single JSON object matching the schema. Nothing else.',
      schema: MATCH_INSIGHT_SCHEMA,
      postProcess: postProcessMatchInsight,
    },
    opts
  )
}

export async function getPlayerInsight(publicPlayerId, opts = {}) {
  return getOrGenerate(
    {
      sourceType: 'PLAYER',
      sourceId: publicPlayerId,
      buildFacts: async () => {
        const player = await findPlayerByPublicId(publicPlayerId)
        if (!player) throw notFound('Player not found.')
        const careerStats = await statisticsService.getPlayerCareerStats(player.id, { matchHistoryLimit: 0 })
        if (careerStats.career.matches === 0) return null // Part 38 — never a forced insight with no data
        const facts = buildPlayerAIContext(careerStats)
        return { facts, fingerprintInput: { matches: careerStats.career.matches, batting: careerStats.career.batting, bowling: careerStats.career.bowling, fielding: careerStats.career.fielding } }
      },
      systemPrompt: PLAYER_INSIGHT_SYSTEM_PROMPT,
      taskInstruction: 'Write the player performance insight now, as a single JSON object matching the schema. Nothing else.',
      schema: PERSON_INSIGHT_SCHEMA,
    },
    opts
  )
}

// Umpire Intelligence & Scale 2.0, Workstreams L/M/N — self-scoped (userId
// comes from the authenticated caller, never a route param — see
// aiInsight.routes.js's own comment), unlike the public player/team
// insights: an umpire's performance narrative is personal-insight
// territory (Workstream W), not a public profile page.
export async function getUmpireInsight(userId, opts = {}) {
  return getOrGenerate(
    {
      sourceType: 'UMPIRE',
      sourceId: String(userId),
      buildFacts: async () => {
        const [summary, trend] = await Promise.all([buildReputationSummary(userId), findMonthlyOfficiatingTrend(userId, 6)])
        if (!summary || (summary.matchesOfficiated === 0 && summary.ratingCount === 0)) return null // Part 38 equivalent — never a forced insight with no data
        const facts = buildUmpireAIContext(summary, trend)
        return {
          facts,
          fingerprintInput: {
            matchesOfficiated: summary.matchesOfficiated,
            reliability: summary.reliability,
            ratingAvg: summary.ratingAvg,
            ratingCount: summary.ratingCount,
            trend,
          },
        }
      },
      systemPrompt: UMPIRE_INSIGHT_SYSTEM_PROMPT,
      taskInstruction: 'Write the umpire performance insight now, as a single JSON object matching the schema. Nothing else.',
      schema: PERSON_INSIGHT_SCHEMA,
    },
    opts
  )
}

export async function getTeamInsight(teamId, opts = {}) {
  return getOrGenerate(
    {
      sourceType: 'TEAM',
      sourceId: teamId,
      buildFacts: async () => {
        const profile = await publicTeamService.getPublicTeamProfile(teamId) // 404s if the team doesn't exist
        if (profile.record.matches === 0) return null
        const facts = buildTeamAIContext(profile)
        return { facts, fingerprintInput: { record: profile.record, topPerformers: profile.topPerformers, recentFormCount: profile.recentForm.length } }
      },
      systemPrompt: TEAM_INSIGHT_SYSTEM_PROMPT,
      taskInstruction: 'Write the team performance insight now, as a single JSON object matching the schema. Nothing else.',
      schema: PERSON_INSIGHT_SCHEMA,
    },
    opts
  )
}
