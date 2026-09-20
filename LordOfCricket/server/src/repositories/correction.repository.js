import { pool } from '../config/db.js'

// Immutable audit trail — every function here is INSERT/SELECT only. Nothing
// in this file ever issues an UPDATE or DELETE against score_corrections.
export async function insertCorrection(
  client,
  { inningsId, targetType, targetId, reasonCode, note, beforeData, afterData, sourceVersion, resultVersion, correctedByUserId, clientActionId, undoesCorrectionId }
) {
  const { rows } = await client.query(
    `INSERT INTO score_corrections
       (innings_id, target_type, target_id, reason_code, note, before_data, after_data,
        source_version, result_version, corrected_by_user_id, client_action_id, undoes_correction_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      inningsId,
      targetType,
      targetId,
      reasonCode,
      note ?? null,
      beforeData,
      afterData,
      sourceVersion,
      resultVersion,
      correctedByUserId,
      clientActionId ?? null,
      undoesCorrectionId ?? null,
    ]
  )
  return rows[0]
}

export async function findCorrectionByClientActionId(client, inningsId, clientActionId) {
  if (!clientActionId) return null
  const { rows } = await client.query('SELECT * FROM score_corrections WHERE innings_id = $1 AND client_action_id = $2', [inningsId, clientActionId])
  return rows[0] || null
}

export async function findCorrectionById(id, client = pool) {
  const { rows } = await client.query('SELECT * FROM score_corrections WHERE id = $1', [id])
  return rows[0] || null
}

export async function findUndoOf(correctionId, client = pool) {
  const { rows } = await client.query('SELECT * FROM score_corrections WHERE undoes_correction_id = $1', [correctionId])
  return rows[0] || null
}

export async function listCorrections(inningsId) {
  const { rows } = await pool.query('SELECT * FROM score_corrections WHERE innings_id = $1 ORDER BY created_at DESC', [inningsId])
  return rows
}
