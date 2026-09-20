import { pool } from '../config/db.js'

export async function findChecklistItems(matchId, umpireUserId) {
  const { rows } = await pool.query(
    `SELECT item_key, is_checked, checked_at FROM umpire_match_checklist_items WHERE match_id = $1 AND umpire_user_id = $2`,
    [matchId, umpireUserId],
  )
  return rows
}

export async function upsertChecklistItem(matchId, umpireUserId, itemKey, isChecked) {
  const { rows } = await pool.query(
    `INSERT INTO umpire_match_checklist_items (match_id, umpire_user_id, item_key, is_checked, checked_at)
     VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN NOW() ELSE NULL END)
     ON CONFLICT (match_id, umpire_user_id, item_key) DO UPDATE
       SET is_checked = $4, checked_at = CASE WHEN $4 THEN NOW() ELSE NULL END
     RETURNING item_key, is_checked, checked_at`,
    [matchId, umpireUserId, itemKey, isChecked],
  )
  return rows[0]
}
