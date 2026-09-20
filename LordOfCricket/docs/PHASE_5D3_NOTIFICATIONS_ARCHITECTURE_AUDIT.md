# PHASE 5D.3 — NOTIFICATIONS ARCHITECTURE AUDIT

**Date:** 2026-08-20  
**Status:** ✅ AUDIT COMPLETE  

---

## EXECUTIVE SUMMARY

**Backend:** ✅ COMPLETE (Phase 18 Feature 17)  
**Mobile UI:** ❌ MISSING (100% of UI to be implemented)  

Backend fully supports in-app notifications with read/unread tracking, pagination, and unread counts. Mobile needs UI implementation only.

---

## BACKEND ARCHITECTURE

### Database Schema
Table: `ground_notifications`

Columns:
- `id` (primary key)
- `user_id` (FK to users)
- `type` (string) — notification type identifier
- `title` (string) — notification title
- `body` (nullable string) — detailed message
- `related_booking_id` (nullable FK) — associated booking
- `related_match_id` (nullable FK) — associated match  
- `is_read` (boolean, default false) — read state
- `created_at` (timestamp, default now)

**Design:** Best-effort notifications (failures don't block primary actions)

---

### API Contract

#### GET /ground/notifications
**Auth:** Required (session)  
**Parameters:**
- `limit` (optional, default 20, max 50 per inference)
- `offset` (optional, default 0)

**Response:**
```json
{
  "notifications": [
    {
      "id": 1,
      "userId": 123,
      "type": "booking_confirmed",
      "title": "Booking Confirmed",
      "body": "Your booking for Ground XYZ is confirmed",
      "relatedBookingId": 456,
      "relatedMatchId": null,
      "isRead": false,
      "createdAt": "2026-08-20T10:30:00Z"
    }
  ],
  "total": 25,
  "unreadCount": 3
}
```

**Sorting:** DESC by createdAt (newest first)  
**Pagination:** Offset-based, stable ordering

---

#### POST /ground/notifications/:id/read
**Auth:** Required (session)  
**Parameter:** `id` (notification id in path)  
**Body:** (none)  
**Response:** Updated notification (with isRead=true)  
**Authorization:** Backend verifies user_id matches authenticated user

---

#### POST /ground/notifications/read-all
**Auth:** Required (session)  
**Body:** (none)  
**Response:** No body, 200 status  
**Behavior:** Marks all unread notifications for this user as read

---

## MOBILE INFRASTRUCTURE

### Missing Components
- ❌ Notification API service
- ❌ Notification types/interfaces
- ❌ Notification hooks
- ❌ Query keys for notifications
- ❌ Notifications screen
- ❌ Notification components

### Existing Components (Reusable)
- ✅ API client (api.ts)
- ✅ TanStack Query setup
- ✅ Zustand auth
- ✅ Expo Router navigation
- ✅ Design system (Colors, Spacing, Typography)
- ✅ LoadingScreen, ErrorScreen, EmptyState components
- ✅ FlatList patterns

---

## IMPLEMENTATION ROADMAP

### Phase 1: Types
- Create Notification interface
- Create NotificationResponse interface
- Align with backend contract exactly

### Phase 2: API Service
- Create notificationApi.ts
- Implement getNotifications(limit, offset)
- Implement markNotificationRead(id)
- Implement markAllRead()

### Phase 3: Query Infrastructure
- Create notification query keys
- Implement useNotifications(limit, offset, enabled)
- Implement useUnreadCount()
- Implement useMarkNotificationRead()
- Implement useMarkAllRead()

### Phase 4: UI Screens
- Create notifications.tsx screen
- Implement FlatList with NotificationCard
- Implement mark-read on tap
- Implement mark-all-read button
- Implement loading/error/empty states
- Add pull-to-refresh

### Phase 5: Navigation Integration
- Add notifications route to tab navigation (or appropriate location)
- Add unread badge to entry point if count > 0

### Phase 6: Navigation Metadata
- Parse relatedBookingId/relatedMatchId
- Navigate to booking/match detail on notification tap (if applicable)
- Fallback: mark read without navigation if no relation

---

## SECURITY AUDIT

✅ **Authentication:** Required (session cookie)  
✅ **Authorization:** Backend verifies user_id (IDOR prevented)  
✅ **Data Privacy:** No sensitive info unnecessarily exposed  
✅ **No Client Authorization:** Backend is source of truth  

---

## NOTIFICATION TYPES (INFERRED)

Based on groundNotification.service.js usage, possible types:
- `booking_confirmed` (booking created)
- `booking_cancelled` (booking cancelled)
- `match_scheduled` (match created)
- `match_reminder` (match upcoming)
- `team_update` (team changes)
- (Others TBD based on backend senders)

**Action:** Query backend to get actual enum values if available

---

## REAL-TIME CONSIDERATIONS

### Socket.IO
If Socket.IO notification listener exists:
- Reuse existing socket connection
- Listen to relevant notification event
- Invalidate TanStack Query cache on new notification
- Update unread count

If not:
- Polling via refetch (existing pattern)
- No new socket infrastructure needed this phase

---

## PERFORMANCE

- FlatList: Efficient for unbounded notifications
- Pagination: Offset-based, 20 per page default
- Caching: TanStack Query with appropriate staleTime
- No duplicate queries

---

## ACCESSIBILITY

- Touch targets ≥ 44pt
- Clear read/unread indication (not color-only)
- Screen reader labels
- Proper contrast

---

## CONCLUSION

**Backend Status:** ✅ Ready for mobile integration  
**Mobile Status:** ❌ UI implementation required  
**Estimated Effort:** Medium  
**Risk:** Low (backend contract clear, no unknowns)  

Ready to proceed with Phase 5D.3 implementation.

