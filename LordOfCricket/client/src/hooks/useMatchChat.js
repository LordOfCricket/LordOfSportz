import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { socketUrl } from '../services/socket.js'
import { fetchMatchMessages, sendMatchMessage } from '../services/matchMessageApi.js'

// Umpire Communication & Commercial 2.0 — REST does the initial load AND
// every send (the authoritative write); the socket is realtime-receive
// only, joining a participant-authorized room (join-match-chat, server-
// verified via the caller's own session cookie — see matchChatRealtime.js;
// this used to send a localStorage JWT that no real user has had since
// Phase 3's OTP migration, silently breaking match chat entirely, fixed in
// Phase 8) and appending whatever match:message events arrive. Mirrors
// useSocketMatchTransport's "one connection per hook mount, joined/left on
// mount/unmount" convention.
export function useMatchChat(matchId, { enabled = true } = {}) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const socketRef = useRef(null)

  const addMessage = useCallback((message) => {
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]))
  }, [])

  useEffect(() => {
    if (!enabled || !matchId) return undefined
    let cancelled = false
    // Deferred via setTimeout(0), not called synchronously in the effect
    // body — same pattern useUmpireDashboard.js/useUmpireStatistics.js
    // already use, avoiding the cascading-render lint rule.
    const loadTimer = window.setTimeout(() => {
      if (cancelled) return
      setLoading(true)
      setError('')
      fetchMatchMessages(matchId)
        .then((msgs) => {
          if (!cancelled) setMessages(msgs)
        })
        .catch((err) => {
          if (!cancelled) setError(err.response?.data?.message || err.response?.data?.error || 'Unable to load messages.')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 0)

    const socket = io(socketUrl, { transports: ['websocket', 'polling'], withCredentials: true })
    socketRef.current = socket
    socket.on('connect', () => {
      socket.emit('join-match-chat', { matchId: Number(matchId) })
    })
    socket.on('match:message', (message) => {
      if (Number(message.matchId) === Number(matchId)) addMessage(message)
    })
    socket.on('match:error', (err) => {
      // Realtime is a convenience layer only — a join/auth error here never
      // blocks the REST-loaded history above from being usable.
      console.error('Match chat realtime error:', err?.message)
    })

    return () => {
      cancelled = true
      window.clearTimeout(loadTimer)
      socket.emit('leave-match-chat', { matchId: Number(matchId) })
      socket.disconnect()
    }
  }, [matchId, enabled, addMessage])

  const send = useCallback(
    async (body) => {
      setSending(true)
      setError('')
      try {
        const message = await sendMatchMessage(matchId, body)
        addMessage(message)
        return true
      } catch (err) {
        setError(err.response?.data?.message || err.response?.data?.error || 'Unable to send message.')
        return false
      } finally {
        setSending(false)
      }
    },
    [matchId, addMessage],
  )

  return { messages, loading, error, sending, send }
}
