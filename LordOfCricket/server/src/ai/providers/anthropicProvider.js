// Phase 16 — the only file in this codebase that imports the Anthropic SDK.
// Structured outputs (`output_config.format`) constrain the model's JSON
// shape server-side; aiInsight.service.js still independently re-validates
// the parsed result (Part 47 — "never trust provider JSON blindly", defense
// in depth against a malformed or out-of-schema response slipping through).

import Anthropic from '@anthropic-ai/sdk'
import { buildUserContent } from '../../domain/ai/buildPromptPayload.js'

const DEFAULT_MODEL = 'claude-sonnet-5'
const DEFAULT_MAX_TOKENS = 1024
const REQUEST_TIMEOUT_MS = 30000 // Part 26 — every AI request has a bounded timeout, never hangs indefinitely.

let client = null
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.AI_API_KEY })
  return client
}

export async function generateStructuredInsight({ systemPrompt, factsPayload, taskInstruction, schema, maxTokens = DEFAULT_MAX_TOKENS }) {
  const model = process.env.AI_MODEL || DEFAULT_MODEL

  const userContent = buildUserContent(factsPayload, taskInstruction)

  const response = await getClient().messages.create(
    {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      output_config: { format: { type: 'json_schema', schema } },
    },
    { timeout: REQUEST_TIMEOUT_MS }
  )

  if (response.stop_reason === 'refusal') {
    const err = new Error('AI provider declined the request.')
    err.code = 'AI_REFUSAL'
    throw err
  }

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock) {
    const err = new Error('AI response contained no text content.')
    err.code = 'AI_EMPTY_RESPONSE'
    throw err
  }

  return { raw: textBlock.text, model: response.model, stopReason: response.stop_reason }
}
