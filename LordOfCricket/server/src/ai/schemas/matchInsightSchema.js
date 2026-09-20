// Phase 16 Part 7/9/47 — bounded structured output for AI Match Insight.
// `keyMoments[].candidateId` and `standoutPerformers[].publicPlayerId` are
// constrained to reference the candidates/players supplied in context
// (enforced post-hoc in aiInsight.service.js, never trusted from the schema
// alone — Part 11/48: "prefer deterministic application code to attach IDs
// after AI selection").
export const MATCH_INSIGHT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    headline: { type: 'string', maxLength: 120 },
    summary: { type: 'string', maxLength: 1200 },
    keyMoments: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          candidateId: { type: 'string', maxLength: 20 },
          explanation: { type: 'string', maxLength: 280 },
        },
        required: ['candidateId', 'explanation'],
        additionalProperties: false,
      },
    },
    standoutPerformers: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          publicPlayerId: { type: 'string', maxLength: 20 },
          reason: { type: 'string', maxLength: 280 },
        },
        required: ['publicPlayerId', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['headline', 'summary', 'keyMoments', 'standoutPerformers'],
  additionalProperties: false,
})
