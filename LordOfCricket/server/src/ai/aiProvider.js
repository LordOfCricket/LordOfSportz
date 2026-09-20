// Phase 16 Part 4/5/6 — the ONE abstraction application services depend on.
// Nothing outside this directory ever imports the vendor SDK directly
// (mirrors googleCalendar.service.js's "optional dependency, degrade
// gracefully" shape from Phase 14: isCalendarConfigured() ↔ isAIConfigured()
// here). Swapping providers later means adding a new file under
// providers/ and changing one line below — never touching a controller,
// service, or the React client. API keys never leave the backend (Part 6).

import { generateStructuredInsight as anthropicGenerate } from './providers/anthropicProvider.js'

export function isAIConfigured() {
  return Boolean(process.env.AI_API_KEY) && (process.env.AI_PROVIDER || 'anthropic') === 'anthropic'
}

/**
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {object} params.factsPayload - JSON-serializable context object, sent as the FACTS block
 * @param {string} params.taskInstruction - the specific ask, appended after FACTS
 * @param {object} params.schema - JSON-Schema-subset object (see domain/ai/validateStructuredOutput.js)
 * @param {number} [params.maxTokens]
 * @returns {Promise<{ raw: string, model: string, stopReason: string }>}
 */
export async function generateStructuredInsight(params) {
  if (!isAIConfigured()) {
    const err = new Error('AI provider is not configured.')
    err.code = 'AI_NOT_CONFIGURED'
    throw err
  }
  const provider = process.env.AI_PROVIDER || 'anthropic'
  if (provider !== 'anthropic') {
    const err = new Error(`Unsupported AI_PROVIDER '${provider}'.`)
    err.code = 'AI_NOT_CONFIGURED'
    throw err
  }
  return anthropicGenerate(params)
}
