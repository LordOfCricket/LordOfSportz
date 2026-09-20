import { pool } from '../config/db.js'

// MongoDB cleanup, Phase 2 — AiInsight's storage layer, migrated from
// Mongoose to plain parameterized SQL. Still a pure CACHE — never a second
// source of cricket truth (README principle #4/#9) — just colocated with
// the PostgreSQL facts it narrates now instead of MongoDB. The retired
// Mongoose model (aiInsightMongoLegacy.model.js) is kept only for the
// one-time data migration script and rollback reference — nothing else in
// the live app should import it.
export const AI_INSIGHT_SOURCE_TYPES = ['MATCH', 'PLAYER', 'TEAM']

export async function findAiInsight({ sourceType, sourceId }) {
  const { rows } = await pool.query('SELECT * FROM ai_insights WHERE source_type = $1 AND source_id = $2', [
    sourceType,
    String(sourceId),
  ])
  return rows[0] || null
}

// The live cache-write path (mirrors the retired Mongoose model's
// `findOneAndUpdate({sourceType, sourceId}, {...}, {upsert:true})` exactly)
// — keyed on the REAL business uniqueness constraint, not legacy_mongo_id.
export async function upsertAiInsight({ sourceType, sourceId, sourceFingerprint, provider, model, payload, generatedAt }) {
  const { rows } = await pool.query(
    `INSERT INTO ai_insights (source_type, source_id, source_fingerprint, provider, model, payload, generated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (source_type, source_id) DO UPDATE SET
       source_fingerprint = EXCLUDED.source_fingerprint,
       provider = EXCLUDED.provider,
       model = EXCLUDED.model,
       payload = EXCLUDED.payload,
       generated_at = EXCLUDED.generated_at,
       updated_at = NOW()
     RETURNING *`,
    [sourceType, String(sourceId), sourceFingerprint, provider, model, payload, generatedAt],
  )
  return rows[0]
}

export async function deleteAiInsight({ sourceType, sourceId }) {
  const { rows } = await pool.query('DELETE FROM ai_insights WHERE source_type = $1 AND source_id = $2 RETURNING *', [
    sourceType,
    String(sourceId),
  ])
  return rows[0] || null
}

// Idempotent upsert keyed on the ORIGINAL MongoDB `_id` — used only by the
// one-time Phase 2 data migration script
// (scripts/migrateAiInsightsToPostgres.js), never by the live request path.
// Deliberately a SEPARATE conflict target from upsertAiInsight above: the
// migration needs "the same Mongo document maps to the same Postgres row on
// every re-run" (legacy_mongo_id), which is a different key than the live
// service's "the same (sourceType, sourceId) entity has at most one row"
// (source_type, source_id) — both constraints exist on this table for
// exactly these two different callers.
export async function upsertAiInsightByLegacyMongoId(fields) {
  const { rows } = await pool.query(
    `INSERT INTO ai_insights
       (source_type, source_id, source_fingerprint, provider, model, payload,
        generated_at, legacy_mongo_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (legacy_mongo_id) WHERE legacy_mongo_id IS NOT NULL DO UPDATE SET
       source_type = EXCLUDED.source_type,
       source_id = EXCLUDED.source_id,
       source_fingerprint = EXCLUDED.source_fingerprint,
       provider = EXCLUDED.provider,
       model = EXCLUDED.model,
       payload = EXCLUDED.payload,
       generated_at = EXCLUDED.generated_at,
       updated_at = NOW()
     RETURNING *, (xmax = 0) AS inserted`,
    [
      fields.sourceType,
      String(fields.sourceId),
      fields.sourceFingerprint,
      fields.provider,
      fields.model,
      fields.payload,
      fields.generatedAt,
      fields.legacyMongoId,
      fields.createdAt,
      fields.updatedAt,
    ],
  )
  return rows[0]
}
