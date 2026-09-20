// ============================================================================
// LEGACY MIGRATION TOOLING ONLY — NOT USED BY RUNTIME APPLICATION
// ============================================================================
//
// RETIRED from the live request path (MongoDB cleanup, Phase 2 — see
// docs/ARCHITECTURE.md / the Phase 0 audit report). aiInsight.service.js
// now reads/writes PostgreSQL's `ai_insights` table via
// models/aiInsight.model.js instead. This file is kept, unchanged, ONLY so
// server/src/scripts/migrateAiInsightsToPostgres.js can read the original
// MongoDB documents, and as a rollback reference (MongoDB's AiInsight data
// itself is never deleted by the migration). Do not import this from any
// new code — the canonical `AiInsight` model going forward is the
// PostgreSQL one.
//
// Phase 16 Part 20/21 — AI-generated narrative content is exactly the
// "generated/unstructured content" case the Phase 15/16 spec calls out for
// MongoDB (canteen's existing home): PostgreSQL remains authoritative for
// every cricket fact this document only NARRATES, never decides. This
// collection is a cache/read-model — deleting it and regenerating on next
// request loses nothing authoritative, unlike any PostgreSQL table in this
// app.
//
// `sourceFingerprint` ties one cached insight to the exact authoritative
// state it was generated from (domain/ai/computeSourceFingerprint.js) — a
// correction, a new finalized match, or new career-stat-affecting data
// changes the fingerprint, and the service layer treats a fingerprint
// mismatch as stale (Part 22/23), never serving it as current.
import mongoose from 'mongoose'

const aiInsightSchema = new mongoose.Schema(
  {
    sourceType: { type: String, required: true, enum: ['MATCH', 'PLAYER', 'TEAM'] },
    sourceId: { type: String, required: true }, // matchId, publicPlayerId, or teamId as a string
    sourceFingerprint: { type: String, required: true },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true }, // the validated structured insight
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

aiInsightSchema.index({ sourceType: 1, sourceId: 1 }, { unique: true })

export default mongoose.model('AiInsight', aiInsightSchema)
