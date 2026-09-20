import { useState } from 'react'
import { Send } from 'lucide-react'
import { useMatchChat } from '../../hooks/useMatchChat.js'
import { formatMessageTime, senderLabel } from '../../models/matchChat.model.js'
import { useAuth } from '../../hooks/useAuth.js'

// Umpire Communication & Commercial 2.0 — shared by both the Umpire
// Dashboard ("Message Ground Owner") and the Ground Owner's match view
// ("Message Umpire"). One component, one authorization gate server-side —
// never a role-specific duplicate. Inline expandable panel (not a modal),
// matching the existing "Find Replacement"/"History" toggle convention
// already used on GroundMatchesPage, and naturally mobile-friendly (no
// horizontal overflow — a single-column stack throughout).
export default function MatchChatPanel({ matchId, onClose }) {
  const { user } = useAuth()
  const { messages, loading, error, sending, send } = useMatchChat(matchId)
  const [draft, setDraft] = useState('')

  const handleSend = async (e) => {
    e.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed) return
    const ok = await send(trimmed)
    if (ok) setDraft('')
  }

  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Match Messages</p>
        {onClose && (
          <button type="button" onClick={onClose} className="text-xs font-semibold text-slate-400 hover:text-slate-200">
            Close
          </button>
        )}
      </div>

      <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
        {loading && <p className="text-xs text-slate-400">Loading messages…</p>}
        {!loading && error && <p className="text-xs text-rose-300">{error}</p>}
        {!loading && !error && messages.length === 0 && <p className="text-xs text-slate-400">No messages yet. Say hello.</p>}
        {!loading &&
          messages.map((m) => {
            const mine = m.senderUserId === user?.id
            return (
              <div key={m.id} className={`rounded-lg border px-3 py-2 text-xs ${mine ? 'border-emerald-400/20 bg-emerald-500/10' : 'border-white/10 bg-white/5'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-200">{mine ? 'You' : senderLabel(m.senderRole)}</span>
                  <span className="text-[10px] text-slate-500">{formatMessageTime(m.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-slate-300">{m.body}</p>
              </div>
            )
          })}
      </div>

      <form onSubmit={handleSend} className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={1000}
          placeholder="Write a message…"
          className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-emerald-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  )
}
