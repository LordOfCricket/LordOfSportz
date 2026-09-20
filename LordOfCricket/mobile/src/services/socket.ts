import { io, Socket } from 'socket.io-client'
import { API_URL } from './api'
import { SocketMatchStatePayload } from '../types'

// Phase 3A — Centralized Socket.IO service for cricket live-match realtime.
// Owns connection lifecycle, room management, and event forwarding.
// Zero cricket logic: transport layer only, mirrors the backend cricket realtime module.

type SocketMatchState = SocketMatchStatePayload

interface SocketCommentaryPayload {
  matchId: number
  inningsId: number
  inningsVersion: number
  mode: 'append' | 'resync'
  entries: {
    id: number
    type: string
    ballLabel: string
    text: string
    tags: string[]
    score: { runs: number; wickets: number } | null
    deliveryId: number | null
    eventId: number | null
    sequence: number
  }[]
}

interface SocketMatchError {
  message: string
}

// Derive socket URL from API URL (remove /api suffix)
// API_URL is http://localhost:3000/api; socket needs http://localhost:3000
const getSocketUrl = (): string => {
  const trimmed = API_URL.replace(/\/$/, '')
  return trimmed.replace(/\/api$/, '')
}

export interface MatchStateListener {
  (payload: SocketMatchState): void
}

export interface CommentaryListener {
  (payload: SocketCommentaryPayload): void
}

export interface ErrorListener {
  (error: SocketMatchError): void
}

interface MatchListeners {
  onState?: MatchStateListener
  onCommentary?: CommentaryListener
  onError?: ErrorListener
}

class SocketService {
  private socket: Socket | null = null
  private matchListeners: Map<number, MatchListeners> = new Map()
  private joinedMatches: Set<number> = new Set()
  private connectionAttempts = 0
  private readonly maxReconnectAttempts = 5
  private bookingUpdateListeners: ((data: any) => void)[] = []
  private bookingListenerRegistered = false

  /**
   * Initialize Socket.IO connection with session cookies.
   * Safe to call multiple times — existing connection is reused.
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve()
        return
      }

      if (this.socket) {
        resolve()
        return
      }

      try {
        const socketUrl = getSocketUrl()
        this.socket = io(socketUrl, {
          withCredentials: true, // CRITICAL: Send HttpOnly cookies
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: this.maxReconnectAttempts,
        })

        this.socket.on('connect', () => {
          this.connectionAttempts = 0
          // Rejoin all previously joined matches on reconnect
          this.joinedMatches.forEach((matchId) => {
            this._joinMatchInternal(matchId)
          })
          resolve()
        })

        this.socket.on('connect_error', (error: Error) => {
          this.connectionAttempts++
          if (this.connectionAttempts >= this.maxReconnectAttempts) {
            reject(new Error(`Socket connection failed after ${this.maxReconnectAttempts} attempts`))
          }
        })

        this.socket.on('disconnect', () => {
          // Socket.IO handles automatic reconnection — no action needed
        })

        // Register event listeners for all match rooms
        this.socket.on('match:state', (payload: SocketMatchState) => {
          const matchId = payload.match.id
          const listeners = this.matchListeners.get(matchId)
          if (listeners?.onState) {
            listeners.onState(payload)
          }
        })

        this.socket.on('match:commentary', (payload: SocketCommentaryPayload) => {
          const listeners = this.matchListeners.get(payload.matchId)
          if (listeners?.onCommentary) {
            listeners.onCommentary(payload)
          }
        })

        this.socket.on('match:error', (error: SocketMatchError) => {
          // Broadcast to all match error listeners (since we don't know which match failed)
          this.matchListeners.forEach((listeners) => {
            if (listeners.onError) {
              listeners.onError(error)
            }
          })
        })

        // Register booking listener if there are active subscribers
        if (this.bookingUpdateListeners.length > 0 && !this.bookingListenerRegistered) {
          this.socket.on('booking:dateChanged', (data: any) => {
            this.bookingUpdateListeners.forEach(listener => listener(data))
          })
          this.bookingListenerRegistered = true
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Internal method to emit join-match event.
   * Does NOT add to joinedMatches — caller handles that.
   */
  private _joinMatchInternal(matchId: number): void {
    if (!this.socket?.connected) return
    this.socket.emit('join-match', { matchId: Number(matchId) })
  }

  /**
   * Subscribe to a match's realtime events.
   * Automatically connects Socket.IO if not already connected.
   * Automatically joins the match room on backend.
   */
  async subscribeToMatch(
    matchId: number,
    listeners: MatchListeners
  ): Promise<void> {
    // Ensure socket is connected
    await this.connect()

    // Store listeners for this match
    this.matchListeners.set(matchId, listeners)

    // Join the match room (idempotent)
    if (!this.joinedMatches.has(matchId)) {
      this._joinMatchInternal(matchId)
      this.joinedMatches.add(matchId)
    }
  }

  /**
   * Subscribe to booking availability updates.
   * Notified when bookings change for any ground/date.
   * Automatically ensures socket is connected.
   */
  subscribeToBookingUpdates(callback: (data: any) => void): () => void {
    // Add listener first
    this.bookingUpdateListeners.push(callback)

    // Ensure socket is connected, which will register the listener if needed
    this.connect().catch(() => {}) // Ignore connection errors; listeners work on reconnect

    // Return unsubscribe function
    return () => {
      const index = this.bookingUpdateListeners.indexOf(callback)
      if (index > -1) {
        this.bookingUpdateListeners.splice(index, 1)
      }
    }
  }

  /**
   * Unsubscribe from a match's realtime events.
   * Leaves the match room on backend (if connected).
   * CRITICAL: Always cleans up local state, even if socket is disconnected.
   */
  unsubscribeFromMatch(matchId: number): void {
    // Always clean up local state, regardless of connection status
    this.matchListeners.delete(matchId)
    this.joinedMatches.delete(matchId)

    // Only emit leave-match if socket is connected
    if (this.socket?.connected) {
      this.socket.emit('leave-match', { matchId: Number(matchId) })
    }
  }

  /**
   * Check if currently connected to Socket.IO server.
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false
  }

  /**
   * Disconnect Socket.IO and clean up all subscriptions.
   */
  disconnect(): void {
    if (!this.socket) return
    this.matchListeners.clear()
    this.joinedMatches.clear()
    this.socket.disconnect()
    this.socket = null
  }
}

// Singleton instance
export const socketService = new SocketService()
