import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { socketUrl } from '../services/socket.js'

// The low-level Socket.IO transport for one match room. Mirrors
// the existing canteen convention (useCanteenOrderStatus.js): one connection
// per hook mount, joined/left on mount/unmount — no app-wide singleton,
// since only one Match Summary page ever needs a cricket socket at a time.
// Contains ZERO cricket logic: it only reports whatever `match:state` the
// server published, verbatim (never a locally-reconstructed delta).
//
// Both pieces of state are tagged with the matchId they belong to (the same
// "derived, resetKey-tagged state" pattern used throughout this codebase's
// other polling hooks) rather than cleared via a synchronous setState at the
// top of the effect — so a matchId change correctly reports "not connected,
// no data" immediately without ever needing an explicit reset call.
export function useSocketMatchTransport(matchId, { enabled = true } = {}) {
  const [connection, setConnection] = useState({ matchIdOfConnection: null, connected: false })
  const [snapshot, setSnapshot] = useState({ matchIdOfData: null, data: null, lastUpdatedAt: null })

  useEffect(() => {
    if (!enabled || !matchId) return undefined

    const socket = io(socketUrl, { transports: ['websocket', 'polling'] })

    socket.on('connect', () => {
      socket.emit('join-match', { matchId: Number(matchId) })
      setConnection({ matchIdOfConnection: matchId, connected: true })
    })
    socket.on('disconnect', () => setConnection({ matchIdOfConnection: matchId, connected: false }))
    socket.on('connect_error', () => setConnection({ matchIdOfConnection: matchId, connected: false }))
    socket.on('match:state', (payload) => {
      setSnapshot({ matchIdOfData: matchId, data: payload, lastUpdatedAt: Date.now() })
    })
    socket.on('match:error', (err) => {
      console.error('Match room error:', err?.message)
    })

    return () => {
      socket.emit('leave-match', { matchId: Number(matchId) })
      socket.disconnect()
    }
  }, [matchId, enabled])

  const isCurrentConnection = connection.matchIdOfConnection === matchId
  const isCurrentData = snapshot.matchIdOfData === matchId

  return {
    data: isCurrentData ? snapshot.data : null,
    connected: isCurrentConnection ? connection.connected : false,
    lastUpdatedAt: isCurrentData ? snapshot.lastUpdatedAt : null,
  }
}
