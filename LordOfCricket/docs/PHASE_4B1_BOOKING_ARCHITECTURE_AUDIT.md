# Phase 4B.1 — Ground Booking Architecture Audit

**Status:** ✅ AUDIT COMPLETE  
**Date:** 2026-08-19  
**Method:** Backend Code Inspection  
**Scope:** Ground booking, availability, team booking, conflict prevention

---

## Executive Summary

The LOC booking system is **well-architected with clear separation of concerns**:

- **Walk-in Ground Bookings** (Primary): Single ground, simple CRUD, auto-confirmed
- **Team Bookings** (Advanced): Multi-ground/team matches, approval workflow, holds/proposals
- **Availability System** (Read-Only): PostgreSQL-computed, cached in memory, timezone-aware
- **Conflict Prevention**: Database EXCLUDE constraint (walk-in) + application logic (team bookings)
- **No Payment Integration**: Booking is separate from payment; ground bookings are free; only umpire earnings have payment

**Recommendation:** Mobile app should focus on walk-in ground booking first (simpler), then team bookings in Phase 5.

---

## 1. Booking Architecture Overview

```
LOC Booking System
    ├─ Walk-in Ground Bookings
    │  ├─ Single ground (default/configured ground)
    │  ├─ Simple date/time slot selection
    │  ├─ Auto-confirmed (no approval needed)
    │  ├─ Public availability (no auth required to view)
    │  └─ Conflict prevention: DB EXCLUDE constraint
    │
    ├─ Team Bookings (Phase 24)
    │  ├─ Multi-ground support
    │  ├─ Match/Practice type
    │  ├─ Status machine (HOLD → PROPOSED → PENDING → CONFIRMED)
    │  ├─ Approval workflow
    │  └─ Conflict prevention: Application logic + transaction
    │
    └─ Availability System
       ├─ Slot-based (configurable duration)
       ├─ Ground-local timezone
       ├─ Excludes: confirmed bookings, staff blocks, match days
       └─ Public read API
```

---

## 2. Walk-In Ground Booking APIs

### Availability (Public, No Auth)

**GET `/bookings/availability`**

```
Query Parameters:
  date: "YYYY-MM-DD" (required)

Response:
{
  "date": "2026-08-19",
  "slots": [
    {
      "startTime": "2026-08-19T06:00:00.000Z",
      "endTime": "2026-08-19T07:00:00.000Z",
      "status": "AVAILABLE"
    },
    {
      "startTime": "2026-08-19T07:00:00.000Z",
      "endTime": "2026-08-19T08:00:00.000Z",
      "status": "UNAVAILABLE"  // BOOKED, BLOCKED, or MATCH
    }
  ]
}
```

**Access:** Public (unauthenticated)  
**Staff View:** Shows detailed reason (BOOKED/BLOCKED/MATCH/PAST)  
**Public View:** Only shows AVAILABLE/UNAVAILABLE

### Create Booking (Authenticated)

**POST `/bookings`**

```
Required Auth: Authenticated user
Rate Limited: Yes (bookingWriteLimiter)

Request Body:
{
  "startTime": "2026-08-19T06:00:00.000Z",  // Exact time from GET availability
  // OR alternative format:
  "date": "2026-08-19",
  "hour": 6,
  "minute": 0,
  
  // Optional:
  "purpose": "practice",
  "expectedPlayers": 12,
  "notes": "Need 2 nets",
  "contactPhone": "9876543210",
  "contactEmail": "user@example.com",
  "clientActionId": "idempotency-key"  // For idempotent replay
}

Response (201 Created):
{
  "booking": {
    "publicBookingId": "bk_abc123def456",
    "bookingType": "WALK_IN",
    "blockType": null,
    "startTime": "2026-08-19T06:00:00.000Z",
    "endTime": "2026-08-19T07:00:00.000Z",
    "status": "CONFIRMED",
    "displayStatus": "APPROVED",
    "purpose": "practice",
    "expectedPlayers": 12,
    "notes": "Need 2 nets",
    "createdAt": "2026-08-19T12:00:00.000Z",
    "cancelledAt": null,
    "contactPhone": "9876543210",
    "contactEmail": "user@example.com",
    "customerName": "User Name"
  }
}
```

**Conflict Behavior:** If slot is already booked, returns 409 CONFLICT before creating booking

### List My Bookings (Authenticated)

**GET `/bookings/my`**

```
Response:
{
  "bookings": [
    { /* same serialization as create response */ }
  ]
}
```

### Cancel Booking (Authenticated)

**POST `/bookings/:publicBookingId/cancel`**

```
Response:
{
  "booking": {
    /* same structure, status now "CANCELLED" */
  }
}
```

---

## 3. Availability Computation

### Algorithm

**File:** `domain/booking/availability.js`

1. **Occupied Ranges:**
   - Confirmed bookings (all statuses from CONFIRMED table query)
   - Staff blocks (explicit STAFF_BLOCK entries)
   - Match days (whole-day blocks when match exists)

2. **Slot Generation:**
   - Ground opening: 6 AM (GROUND_OPENING_HOUR)
   - Ground closing: 6 PM (GROUND_CLOSING_HOUR)
   - Slot duration: 60 minutes (SLOT_DURATION_MINUTES)
   - Slots marked AVAILABLE if no overlap with occupied ranges

3. **Timezone Handling:**
   - All storage: UTC
   - All queries: Relative to ground's local timezone
   - Function: `utcToGroundLocalParts()` converts UTC → ground-local date/hour/minute
   - Function: `groundLocalToUtc()` converts ground-local → UTC for database queries

### Booking Constraints

**Maximum booking horizon:** `MAX_BOOKING_HORIZON_DAYS` (currently 30 days)

**Cannot book:**
- Past dates
- Before today
- Beyond 30 days out

---

## 4. Conflict Prevention

### Walk-In Bookings (Primary)

**Database Constraint:** PostgreSQL EXCLUDE constraint (ground_bookings_no_overlap)

```sql
EXCLUDE USING GIST (
  ground_id WITH =,
  tsrange(start_time, end_time) WITH &&
)
WHERE status IN ('CONFIRMED', ...)
```

**Mechanism:** Database prevents two rows with overlapping times for same ground

**Race Condition Handling:** Double submission is idempotent via `clientActionId`

```
POST /bookings with clientActionId: "abc"
  ├─ First request: Creates booking
  └─ Second request (same clientActionId): Returns existing booking
```

### Team Bookings (Phase 24)

**Application Logic:** Explicit conflict check in service

```
1. Check ground/player/team slot tables
2. Verify no overlapping bookings/proposals/holds
3. Create with status PROPOSED/PENDING
4. Approval changes to CONFIRMED
```

---

## 5. Booking Status Machine

### Walk-In Bookings

**Stored Status:** CONFIRMED (auto-confirmed, no approval needed)

**Display Status:** Computed dynamically
- CONFIRMED (before end time) → Displays as "APPROVED"
- CONFIRMED (after end time) → Displays as "COMPLETED"
- CANCELLED → Displays as "CANCELLED"

**Valid Transitions:**
```
CONFIRMED → CANCELLED (by user or staff)
CONFIRMED → COMPLETED (automatic, when end_time passed)
```

### Team Bookings (Phase 24)

**Stored Status:** Full state machine

```
HOLD → CONFIRMED/CANCELLED/EXPIRED
PROPOSED → CONFIRMED/CANCELLED/EXPIRED
PENDING → CONFIRMED/REJECTED/CANCELLED
CONFIRMED → CANCELLED/NO_SHOW/COMPLETED
```

**Blocking vs Non-Blocking:**
- **Blocking:** HOLD, PROPOSED, PENDING, CONFIRMED (occupies slot)
- **Non-Blocking:** REJECTED, CANCELLED, EXPIRED, COMPLETED, NO_SHOW (doesn't occupy)

---

## 6. Staff Operations

### Staff Schedule (Authenticated, role: staff)

**GET `/bookings/staff/schedule`**

```
Query Parameters:
  from: "YYYY-MM-DD" (optional)
  to: "YYYY-MM-DD" (optional)

Response:
{
  "bookings": [ /* all bookings in date range, including blocks */ ]
}
```

### Create Staff Block (Authenticated, role: staff)

**POST `/bookings/staff/block`**

```
Request Body:
{
  "date": "2026-08-19",
  "hour": 10,
  "minute": 0,
  "purpose": "maintenance",
  "blockType": "MAINTENANCE"  // or "RESERVED", "CLOSED"
}

Response:
{
  "booking": {
    "bookingType": "STAFF_BLOCK",
    "blockType": "MAINTENANCE",
    "status": "CONFIRMED",
    /* ... */
  }
}
```

### Remove Staff Block (Authenticated, role: staff)

**DELETE `/bookings/staff/block/:publicBookingId`**

```
Response: 200 OK
```

### Booking History (Authenticated, role: staff)

**GET `/bookings/history`**

```
Support: Search, filter, sort, pagination

This is a compliance/audit report, staff-only.
```

---

## 7. Team Bookings (Phase 24)

### Architecture

**Scope:** Multi-ground, multi-team matches and practice sessions

**Mounted at:** `GET|POST /grounds/:publicGroundId/bookings`

**Concepts:**
- Match booking: Two teams, fixture match
- Practice booking: One team, practice session
- Proposals: Suggested bookings awaiting approval
- Holds: Provisional reservations

### Status Workflow

```
User creates team booking
  ↓
Status: PENDING (needs ground owner approval)
  ↓
Ground owner approves/rejects
  ├─ CONFIRMED (approved)
  └─ REJECTED (denied)
  ↓
On match day, changes to COMPLETED or NO_SHOW
```

**Current Mobile Requirement:** Not required for Phase 4B; focus on walk-in bookings

---

## 8. Ground Configuration

### Booking Policy

**File:** `domain/booking/policy.js`

```javascript
SLOT_DURATION_MINUTES = 60          // Each slot is 1 hour
GROUND_OPENING_HOUR = 6             // Morning opening
GROUND_CLOSING_HOUR = 18            // Evening closing
MAX_BOOKING_HORIZON_DAYS = 30       // Can book up to 30 days ahead
```

**Default Ground:** System assumes one default ground for walk-in bookings

**Future:** Multi-ground support would require API changes (not in current mobile scope)

---

## 9. Timezone Handling

### Ground-Local Computation

**All time values in database:** UTC

**All availability queries:** Relative to ground's local timezone

**Conversion Functions:**

```
utcToGroundLocalParts(date) → { year, month, day, hour, minute }
  Converts UTC instant to ground's local date/time

groundLocalToUtc(dateStr, hour, minute) → Date
  Converts ground-local date/hour/minute to UTC instant

groundTodayDateStr() → "YYYY-MM-DD"
  Returns today's date in ground's timezone
```

**Mobile Responsibility:** Collect user input in local timezone (via date picker), send to backend either as:
1. Exact `startTime` from availability API (recommended, no client-side math)
2. Plain `{date, hour, minute}` (server converts using ground timezone)

---

## 10. Real-Time Updates

### Booking Realtime Events

**File:** `realtime/bookingRealtime.js`

**Events Published:**

```
booking:dateChanged
  Payload: { date: "YYYY-MM-DD" }
  
  When: After booking is created or cancelled
  Audience: Staff watching the day
  Purpose: Refresh availability for that date
```

**Usage:** Staff dashboards listen for this event to refresh their schedule

**Mobile App:** May subscribe for UI refresh after successful booking

---

## 11. Notifications

**File:** `services/groundNotification.service.js`

**Notifications Sent On:**
- Booking created
- Booking cancelled
- Booking approved (team bookings)
- Booking rejected (team bookings)

**Channel:** Email, SMS, or in-app (implementation-dependent)

---

## 12. Google Calendar Sync

**File:** `services/googleCalendar.service.js`

**Behavior:** After booking is confirmed in database, sync to ground owner's Google Calendar

**Important:** This is async, fire-and-forget. Booking success does NOT depend on Google sync.

**Mobile App:** Does not interact with this; backend handles automatically

---

## 13. Authorization Model

### Walk-In Bookings

| Operation | Required Role | Notes |
|-----------|---------------|-------|
| GET /bookings/availability | None (public) | Anyone can view slots |
| POST /bookings | Authenticated | Any logged-in user can book |
| GET /bookings/my | Authenticated | User sees only their bookings |
| POST /bookings/:id/cancel | Authenticated | User can cancel their own booking |
| GET /bookings/staff/schedule | staff | Staff only |
| POST /bookings/staff/block | staff | Staff only |
| DELETE /bookings/staff/block/:id | staff | Staff only |
| GET /bookings/history | staff | Staff compliance report |

### Team Bookings

| Operation | Required Role | Notes |
|-----------|---------------|-------|
| Create booking | player, staff | Owner of team |
| View booking | player, staff, ground_owner | Involved parties |
| Approve booking | ground_owner, staff | Explicit approval workflow |
| Cancel booking | player, staff | Owner can cancel |

**Mobile Scope (Phase 4B):** Only walk-in bookings; no team bookings yet

---

## 14. Error Handling

**File:** `domain/booking/errors.js`

### Error Codes

```javascript
BOOKING_ERROR_CODES {
  INVALID_DATE: "INVALID_DATE"
  SLOT_UNAVAILABLE: "SLOT_UNAVAILABLE"
  BOOKING_NOT_FOUND: "BOOKING_NOT_FOUND"
  UNAUTHORIZED: "UNAUTHORIZED"
  CONFLICT: "CONFLICT"
  // ... others
}
```

### Common Errors Mobile Will Encounter

| Scenario | Status | Error |
|----------|--------|-------|
| Slot already booked | 409 | SLOT_UNAVAILABLE |
| Past date | 400 | INVALID_DATE |
| Beyond 30 days | 400 | INVALID_DATE |
| User not authenticated | 401 | Unauthorized |
| Invalid date format | 400 | INVALID_DATE |
| Invalid slot time | 400 | SLOT_UNAVAILABLE |

---

## 15. API Gap Analysis for Mobile

### Already Available (Use Immediately)

✅ **GET /bookings/availability** — Public availability without auth

✅ **POST /bookings** — Create booking (authenticate required)

✅ **GET /bookings/my** — List user's bookings

✅ **POST /bookings/:id/cancel** — Cancel booking

### Available But Needs Integration Planning

⚠️ **Real-time updates via Socket.IO** — Can listen to `booking:dateChanged` for refresh

⚠️ **Notifications** — Backend sends these automatically; mobile should show them

### Missing / Not Needed Yet

❌ **Team bookings** — Not in Phase 4B scope; Phase 5+

❌ **Staff operations** — Not in mobile app scope

❌ **Approval workflow** — Team bookings only; Phase 5+

---

## 16. Payment Integration Status

### Ground Bookings

**Status:** NO PAYMENT

Ground bookings in LOC are **free**. Users can book slots without payment.

**Implementation:** Booking creation returns 201 immediately; no payment gateway involved.

### Umpire Earnings Payment

**Status:** SEPARATE SYSTEM

Payment exists only for umpire match fees, not for ground bookings.

**File:** `domain/umpireCommerce/paymentStatus.js`

**Status Machine:**
```
PENDING → APPROVED → PAID
       → CANCELLED
       → FAILED
```

**Mobile Scope:** Not relevant for booking; may be relevant for Phase 5+ (umpire features)

---

## 17. Database Model (Relevant Schema)

### ground_bookings table

```sql
CREATE TABLE ground_bookings (
  id SERIAL PRIMARY KEY,
  public_booking_id VARCHAR(50) UNIQUE,
  ground_id INT NOT NULL,
  user_id INT NOT NULL,
  booking_type VARCHAR(20), -- WALK_IN, MATCH, PRACTICE
  block_type VARCHAR(20),   -- NULL for user bookings, MAINTENANCE/RESERVED for staff blocks
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'CONFIRMED', -- CONFIRMED, CANCELLED
  purpose VARCHAR(100),
  expected_players INT,
  notes TEXT,
  contact_phone VARCHAR(20),
  contact_email VARCHAR(100),
  customer_name VARCHAR(100),
  google_sync_status VARCHAR(20),
  created_at TIMESTAMP DEFAULT now(),
  cancelled_at TIMESTAMP,
  
  -- Prevent overlapping bookings for same ground
  EXCLUDE USING GIST (
    ground_id WITH =,
    tsrange(start_time, end_time) WITH &&
  ) WHERE (status != 'CANCELLED')
);
```

**Indexes:** On ground_id, start_time, user_id for fast queries

---

## 18. Recommended Mobile Integration Flow

### Phase 4B: Walk-In Ground Bookings (Priority)

```
Mobile App
    ↓
User taps "Book Ground"
    ↓
Date picker (defaults to today+1)
    ↓
GET /bookings/availability?date=2026-08-20
    ↓
Display available slots
    ↓
User selects slot
    ↓
Collection: Purpose, expected players, notes (optional)
    ↓
Collection: Contact phone, email (pre-filled from profile)
    ↓
Review screen
    ↓
POST /bookings with startTime from API
    ↓
Success: Show confirmation
    ↓
GET /bookings/my (refresh list)
    ↓
Show booking details
```

### Phase 5: Team Bookings (Deferred)

- Add multi-ground support
- Implement approval workflow
- Show status transitions

---

## 19. Security Considerations

### Verified

✅ **Authorization:** Backend enforces role-based checks (mobile cannot bypass)

✅ **Conflict Prevention:** Database constraint (no app-side workaround possible)

✅ **Idempotency:** `clientActionId` prevents double submissions

✅ **Audit Logging:** Booking changes are logged

### Mobile Responsibilities

⚠️ **Input Validation:** Validate before sending, but backend is authoritative

⚠️ **Error Handling:** Show user-friendly error messages from backend

⚠️ **No Client-Side Security:** Never check permissions on mobile; always validate server-side

---

## 20. Performance Considerations

### API Latency

- **GET /bookings/availability:** Fast (in-memory slot computation)
- **POST /bookings:** Medium (DB conflict check + Google sync fire-and-forget)
- **GET /bookings/my:** Medium (query all user bookings)

### Mobile Considerations

- ✅ Availability: Can be aggressively cached (changes only if new booking)
- ✅ My Bookings: Can be cached and invalidated on successful booking/cancel
- ✅ No polling required: Use Socket.IO `booking:dateChanged` for real-time refresh

---

## 21. Timezone Notes for Mobile

### Critical

- **Database uses:** UTC
- **Ground uses:** Local timezone (e.g., Asia/Kolkata for India)
- **Mobile collects:** User input in device's local timezone

### Handling

**RECOMMENDED:** Mobile sends exact `startTime` from GET /availability response

```
1. User selects date in mobile date picker
2. Mobile calls GET /bookings/availability?date=<selected-date>
3. User taps a slot
4. Mobile captures: slot.startTime (already UTC, computed by backend)
5. Mobile sends: POST /bookings with startTime: "2026-08-19T06:00:00.000Z"
6. Backend: No conversion needed; already UTC
```

**NOT RECOMMENDED:** Client-side date/time math

```
❌ Avoid computing ground-local time in mobile
❌ Avoid timezone conversions in mobile
❌ Backend must remain authoritative on all time logic
```

---

## 22. No Backend Changes Required

### Recommendation

**Backend changes:** NONE

The existing booking API is **sufficient** for mobile integration.

### What Mobile Should Use

1. Public availability endpoint (no auth)
2. Create booking endpoint (auth required)
3. List my bookings (auth required)
4. Cancel booking (auth required)
5. Socket.IO `booking:dateChanged` event (optional real-time refresh)

### What Mobile Should NOT Do

1. ❌ Create team bookings (Phase 5+)
2. ❌ Staff operations (backend-only concern)
3. ❌ Handle payment (not applicable for ground bookings)
4. ❌ Perform timezone conversions (send UTC times)
5. ❌ Recompute availability (use backend API only)

---

## 23. Recommended Phase 4B.2 Plan

### Mobile Implementation Tasks

1. **Booking List Screen**
   - Show user's active bookings (GET /bookings/my)
   - Display status, time, purpose
   - Add button to cancel (POST /bookings/:id/cancel)
   - Refresh on foreground/Socket.IO event

2. **Availability Calendar**
   - Date picker
   - Call GET /bookings/availability?date=...
   - Show available/unavailable slots
   - Color-code by status if staff

3. **Booking Creation Flow**
   - Select date → view slots → select slot
   - Optional: purpose, expected players, notes
   - Auto-fill: contact phone, email from profile
   - POST /bookings with idempotency key
   - Show confirmation

4. **Error Handling**
   - SLOT_UNAVAILABLE: "Slot already booked. Try another time."
   - INVALID_DATE: "Cannot book past dates or beyond 30 days."
   - Network errors: Retry with backoff
   - Rate limit: Show friendly message

5. **Real-Time Updates**
   - Listen to Socket.IO `booking:dateChanged`
   - Refresh GET /bookings/my when event fires
   - Refresh availability for changed date

---

## Final Audit Summary

| Aspect | Status | Notes |
|--------|--------|-------|
| **Booking APIs** | ✅ Complete | All walk-in endpoints available |
| **Availability** | ✅ Complete | Public, no auth required |
| **Conflict Prevention** | ✅ Robust | DB constraint + app logic |
| **Authorization** | ✅ Enforced | Backend validates all requests |
| **Timezone Handling** | ✅ Centralized | Backend owns all timezone logic |
| **Payment** | ❌ N/A | No payment for ground bookings |
| **Team Bookings** | ⏸️ Deferred | Phase 5+ feature |
| **Backend Changes Needed** | ❌ None | Existing APIs sufficient |
| **Mobile Implementation Ready** | ✅ Yes | Can proceed to Phase 4B.2 |

---

## Conclusion

**Verdict: READY FOR MOBILE INTEGRATION**

The LOC booking system is well-structured, secure, and has all the APIs needed for a mobile walk-in booking experience.

**Next Step:** Phase 4B.2 - Implement mobile booking UI using existing APIs

---

**Audit Date:** 2026-08-19  
**Auditor:** Claude (Haiku 4.5)  
**Scope:** Backend ground booking architecture inspection  
**Database Changes:** None required  
**Backend API Changes:** None required  
**Mobile Implementation:** Ready to begin Phase 4B.2
