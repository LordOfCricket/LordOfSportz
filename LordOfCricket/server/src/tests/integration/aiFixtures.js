// Phase 16 — a fake AI provider satisfying the same interface as
// ai/aiProvider.js (isAIConfigured/generateStructuredInsight), injectable
// into aiInsight.service.js via its `provider` option. Lets integration
// tests exercise the real caching/fingerprint/validation/privacy pipeline
// against real PostgreSQL/MongoDB data without a live API key — exactly
// what Part 56/57/58/59's "mocked/fake AI provider response" tests ask for.

export function makeFakeProvider({ response, error = null, delayMs = 0 } = {}) {
  const calls = []
  return {
    isAIConfigured: () => true,
    calls,
    async generateStructuredInsight(params) {
      calls.push(params)
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
      if (error) throw error
      return { raw: JSON.stringify(typeof response === 'function' ? response(params) : response), model: 'fake-model-1', stopReason: 'end_turn' }
    },
  }
}

export const VALID_MATCH_INSIGHT_RESPONSE = {
  headline: 'A hard-fought contest',
  summary: 'Both sides competed well in a tightly fought match.',
  keyMoments: [],
  standoutPerformers: [],
}

export const VALID_PERSON_INSIGHT_RESPONSE = {
  headline: 'Consistent contributor',
  summary: 'Solid numbers across recent matches.',
  highlights: ['Reliable with the bat in recent matches.'],
}
