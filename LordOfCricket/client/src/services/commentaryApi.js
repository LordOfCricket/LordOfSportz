// Public commentary read client. Every field comes straight from
// the server's projection on every fetch; nothing is computed here.
import api from './api.js'

export async function fetchCommentaryPage(matchId, { inningsId, before, limit, type } = {}) {
  const { data } = await api.get(`/matches/${matchId}/commentary`, {
    params: { inningsId, before, limit, type },
  })
  return data
}
