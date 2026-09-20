// Phase 16 Part 12/14 — shared bounded shape for both Player and Team
// insights (structurally identical: a headline, a short summary, a few
// factual highlights). Kept as one schema, reused by both, rather than two
// near-duplicate definitions.
export const PERSON_INSIGHT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    headline: { type: 'string', maxLength: 120 },
    summary: { type: 'string', maxLength: 900 },
    highlights: {
      type: 'array',
      maxItems: 5,
      items: { type: 'string', maxLength: 200 },
    },
  },
  required: ['headline', 'summary', 'highlights'],
  additionalProperties: false,
})
