# Phase 3 — Socket.IO Architecture & Contract

**Status:** AUDIT COMPLETE - Ready for Mobile Implementation  
**Date:** 2026-08-19  
**Source:** Backend `server/src/realtime/cricketRealtime.js` + `server/src/services/liveMatch.service.js` + Web app `client/src/hooks/useSocketMatchTransport.js` & `useMatchCommentary.js`

---

## 1. Socket.IO Server Configuration

**Location:** `server/src/server.js` (line 42)

```javascript
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH'],
    credentials: true  // CRITICAL: Enables cookie-based auth
  }
})
```

**Key Facts:**
- Socket.IO uses existing express server (no separate port)
- CORS credentials enabled (necessary for HttpOnly session cookies)
- Uses both websocket + polling transports
- Serves from same origin as REST API

---

## 2. Cricket Realtime Module Registration

**Location:** `server/src/realtime/cricketRealtime.js`

This is the ONLY module that handles cricket live data. Four total realtime modules registered:
- `registerCricketRealtime(io)` — match state + commentary
- `registerBookingRealtime(io)` — ground booking (out of scope for Phase 3)
- `registerCanteenRealtime(io)` — canteen orders (out of scope)
- `registerMatchChatRealtime(io)` — match chat (out of scope)

Each module independently registers `io.on('connection', ...)` handlers. Socket.IO fires every registered handler for each connection.

---

## 3. Match Room Naming & Joining

**Room Format:** `match:${matchId}` (e.g., `match:42`)

### Client → Server: Join Match

```javascript
socket.emit('join-match', { matchId: Number })
```

**Server Validation (cricketRealtime.js line 34-51):**
- Client sends matchId (number)
- Server validates: `Number.isInteger(matchId) && matchId > 0`
- Server queries database for match existence: `findMatchById(matchId)`
- **If invalid or not found:** Server responds `socket.emit('match:error', { message: '...' })`
- **If valid:** Server silently joins socket to room `match:${matchId}`

**No explicit success response** — client knows it worked if match:state events arrive.

### Client → Server: Leave Match

```javascript
socket.emit('leave-match', { matchId: Number })
```

**Server Behavior (cricketRealtime.js line 53-56):**
- Server validates matchId (same checks)
- Server calls `socket.leave(matchRoom(matchId))`
- No response
- Socket.IO automatically removes socket from all rooms on disconnect

---

## 4. Server → Client: Match State

**Event Name:** `match:state`  
**Room:** Published to `match:${matchId}`  
**Trigger:** Called by scoring controllers AFTER database transaction commits

### Publishing (cricketRealtime.js line 79-90)

```javascript
export async function publishMatchState(io, matchId, reason)
```

**Contract:**
- Called by scoring service AFTER write is durable (Part 12/78)
- Re-reads fresh state from DB (never forwards in-memory copy)
- Publishes to room: `io.to(matchRoom(matchId)).emit('match:state', payload)`
- Failures are fire-and-forget (logger.error only, never throws)

**Payload Structure** (liveMatch.service.js line 50-62 + buildLiveInningsState.js line 102-124):

```typescript
{
  matchId: number,
  reason: string,  // Informational only (e.g., "delivery:1.2")
  match: {
    id: number,
    status: 'upcoming' | 'live' | 'completed',
    isLive: boolean,          // true if status=live AND not in innings break
    isInningsBreak: boolean,  // true if status=live but current innings not live
    isCompleted: boolean,     // status=completed
    isFinalized: boolean,     // status=finalized
  },
  result: {
    resultType: string,       // 'RESULT_WIN' | 'RESULT_NO_RESULT' etc.
    resultMargin: number,
    text: string,
    winnerTeamId: number,
  } | null,
  target: number | null,  // Only for innings 2+ (first innings' final score + 1)
  currentInnings: {
    id: number,
    number: number,             // 1 for first innings, 2 for second
    version: number,            // Incremented on every scoring write
    status: 'upcoming' | 'live' | 'completed',
    battingTeamId: number,
    bowlingTeamId: number,
    runs: number,
    wickets: number,
    legalBalls: number,
    oversLabel: string,         // e.g., "5.2" (5 overs, 2 balls)
    currentRunRate: number | null,
    chase: {                    // Only populated if innings 2+ AND live
      runsNeeded: number,
      ballsRemaining: number | null,
      requiredRunRate: number | null,
    } | null,
    striker: {                  // Only populated if innings is live
      player: {
        publicPlayerId: string | null,
        name: string,
      },
      runs: number,
      balls: number,
      fours: number,
      sixes: number,
      strikeRate: number | null,
    } | null,
    nonStriker: {              // Same structure as striker
      player: { ... },
      runs: number,
      balls: number,
      fours: number,
      sixes: number,
      strikeRate: number | null,
    } | null,
    bowler: {                  // Only populated if innings is live
      player: { ... },
      oversLabel: string,      // e.g., "2.1" (2 overs bowled, 1 ball in current over)
      runs: number,
      wickets: number,
      economy: number | null,
    } | null,
    currentOver: [             // Deliveries in the over currently in progress
      {
        id: number,
        over: number,
        ball: number,          // 0-5 (which ball in the over)
        batRuns: number,
        illegal: boolean,
        extra: string | null,  // 'wide' | 'no_ball' | 'bye' | 'leg_bye' | null
        totalRuns: number,
        isLegalDelivery: boolean,
        isFreeHit: boolean,
        voided: boolean,
        isDeadBall: boolean,
        wicket: boolean,
      }
      // max 6 items for standard cricket
    ],
    recentDeliveries: [        // Last 12 deliveries (RECENT_DELIVERIES_LIMIT), newest first
      { /* same structure as currentOver items */ }
    ],
  } | null,  // null if match hasn't started yet (no innings created)
}
```

**Timing & Frequency:**
- Published immediately after every scoring action completes
- No throttling or debouncing — raw update rate from backend
- At innings break: `match:state` shows first innings final score, target for second innings
- During live: striker/bowler/current-over updated
- After completion: no further `match:state` events (use HTTP polling)

**Client Usage (Web):**
- `useSocketMatchTransport`: Receives payload, stores verbatim (never reconstructs deltas)
- Triggers React re-render → UI updates immediately

---

## 5. Server → Client: Commentary Updates

**Event Name:** `match:commentary`  
**Room:** Published to `match:${matchId}` (same room as match:state, not a second room)  
**Trigger:** Called by scoring controllers AFTER commentary is persisted

### Publishing (cricketRealtime.js line 105-128)

```javascript
export function publishCommentary(io, matchId, { 
  inningsId, 
  inningsVersion, 
  mode,           // 'append' | 'resync'
  entries = [] 
})
```

**Payload Structure:**

```typescript
{
  matchId: number,
  inningsId: number,
  inningsVersion: number,
  mode: 'append' | 'resync',  // 'append' = new entries only; 'resync' = refetch all
  entries: [
    {
      id: number,
      type: string,             // 'DELIVERY' | 'WICKET' | 'MILESTONE' | 'INFO'
      ballLabel: string,        // e.g., "1.2" (1st over, 2nd ball)
      text: string,             // Commentary text
      tags: string[],           // Optional tags
      score: {
        runs: number,
        wickets: number,
      } | null,
      deliveryId: number | null,
      eventId: number | null,
      sequence: number,         // Position in commentary
    }
  ],
}
```

**Modes:**
- **`mode: 'append'`** — New entries just persisted; client appends to list
- **`mode: 'resync'`** — Correction/undo changed many entries; entries array is EMPTY; client must HTTP refetch

**Client Behavior (Web):**
- `useMatchCommentary`: One connection per hook mount
- Joins `match:${matchId}` room (same room as match:state)
- Listens to `match:commentary` events
- On 'append': prepends entries to local list (dedupes by ID)
- On 'resync': fetches first page via HTTP
- On reconnect: always HTTP refetch (no event replay assumption)

---

## 6. Server → Client: Error Events

**Event Name:** `match:error`  
**Room:** Sent directly to socket (not room broadcast)  
**When:** Join-match validation fails

**Payload:**
```typescript
{ message: string }
```

**Examples:**
- Invalid matchId: `"A valid matchId is required to join a match room."`
- Match not found: `"Match not found."`
- Join failed: `"Could not join match room."`

**Client Response:** Log to console (informational only). Client should NOT retry join automatically; instead, provide UI feedback to user.

---

## 7. Connection Lifecycle

### Successful Connection Flow

1. Client: `const socket = io(socketUrl, { withCredentials: true })`
2. Server: Validates session cookie (via middleware in socketAuth.js)
3. Server: `io.on('connection', socket => ...)` fires all registered handlers
4. Client: `socket.on('connect', () => { ... })`
5. Client: `socket.emit('join-match', { matchId })`
6. Server: Validates matchId, calls `socket.join(matchRoom(matchId))`
7. Client: Starts receiving `match:state` and `match:commentary` events

### Disconnection

1. Client: `socket.disconnect()` OR network interruption
2. Server: `socket.on('disconnect', ...)` fires (but cricket module doesn't use this)
3. Socket.IO automatically removes socket from all rooms
4. Client: Stops receiving updates

### Reconnection

- Socket.IO reconnects automatically via exponential backoff
- Client must NOT assume missed events replayed
- Web app refetches first page of commentary on reconnect (`useMatchCommentary` line 73)

### Connection State Tracking (Web Pattern)

```typescript
{
  connected: boolean,        // true if socket.on('connect') fired
  matchIdOfConnection: number,  // matchId this socket joined for
  data: payload | null,      // Latest received event
  lastUpdatedAt: number,     // timestamp when data last changed
}
```

---

## 8. Authentication & Authorization

**Method:** Session Cookie (HttpOnly)  
**Enforcement:** Middleware in `server/src/realtime/socketAuth.js`

- Socket.IO connection requires valid session cookie
- CORS `credentials: true` required to send cookies cross-origin
- Mobile app must use `withCredentials: true` in Socket.IO options
- No role-based authorization at the Socket level — all authenticated users can join any match room

---

## 9. CRITICAL Rules for Mobile Implementation

### Rule 1: No Invented Events
- Mobile MUST use ONLY these events:
  - **Client → Server:** `join-match`, `leave-match`
  - **Server → Client:** `match:state`, `match:commentary`, `match:error`
- Do NOT create new events; do NOT extend this protocol

### Rule 2: Mobile is a Consumer, Not a Publisher
- Mobile MUST NOT emit any events except `join-match` / `leave-match`
- Mobile MUST NOT call `/matches/:id/live-state` polling endpoint (breaks real-time contract)
- Mobile MUST receive state from `match:state` events only

### Rule 3: Zero Cricket Logic in Transport
- `match:state` payload is authoritative and final
- Mobile MUST NOT reconstruct player state, validate scores, or interpret cricket rules
- Mobile MUST NOT cache state across Socket reconnections
- On reconnection, reset to null and wait for next `match:state` event

### Rule 4: No Second Scoring System
- Backend scoring (`server/src/services/scoring.service.js`) is the ONLY authority
- Mobile sees what the backend publishes — always use published version
- Never attempt to track score manually from deliveries

### Rule 5: Payload Passthrough, Not Reconstruction
- Store `match:state` payload verbatim (same approach as web `useSocketMatchTransport`)
- Never delete fields, never reorder, never synthesize missing data
- If a field is `null`, display null — don't guess at a value

---

## 10. Comparison: Web App vs Mobile Requirements

| Aspect | Web App | Mobile |
|--------|---------|--------|
| Connection | One per hook mount | TBD: per screen? per app? |
| Room Mgmt | Manual join/leave on mount/unmount | TBD: handle app background/foreground |
| State Lifecycle | useState (reset on matchId change) | TBD: Zustand? TanStack Query? |
| Reconnection | HTTP refetch on reconnect | TBD: same or different? |
| Events | `match:state`, `match:commentary` | Same |
| Cricket Logic | Zero (passthrough) | Zero (passthrough) |

---

## 11. Testing Scenarios (Pre-Implementation)

Before writing mobile Socket code, verify:

1. ✅ Backend Socket.IO server running
2. ✅ `join-match` with valid matchId → silently joins room
3. ✅ `join-match` with invalid matchId → `match:error` event
4. ✅ `match:state` payload structure matches this doc
5. ✅ `match:commentary` payload structure matches this doc
6. ✅ Session cookie required for connection (no anonymous access)
7. ✅ Multiple clients can join same match room
8. ✅ `leave-match` removes socket from room
9. ✅ Socket.IO reconnects on network interruption
10. ✅ `match:state` continues flowing after reconnection

---

## 12. Development Checklist

### Phase 3A: Mobile Socket Service (NEXT)
- [ ] Create `mobile/src/services/socket.ts` with connection management
- [ ] Implement `joinMatch()` and `leaveMatch()` methods
- [ ] Handle connection state tracking (connected/disconnected/error)
- [ ] Verify session cookie passed with `withCredentials: true`

### Phase 3B: Socket Hooks (AFTER Service)
- [ ] `useLiveMatch(matchId)` — subscribes to `match:state` events
- [ ] `useCommentary(matchId)` — subscribes to `match:commentary` events
- [ ] Both follow web app pattern: store state with matchId tag

### Phase 3C: UI Integration (AFTER Hooks)
- [ ] Update match details screen to show real-time score
- [ ] Show commentary list with new entries appending
- [ ] Handle loading/error/disconnected states

### Phase 3D: Testing & Hardening (FINAL)
- [ ] Test with live backend
- [ ] Test reconnection on network interrupt
- [ ] Test app background/foreground lifecycle
- [ ] Performance: ensure Socket events don't block UI

---

## 13. Next Step

**IMMEDIATE:** Begin Phase 3A by implementing `mobile/src/services/socket.ts` using this architecture as the contract. Do not write any Socket-related code until reviewing this document.
