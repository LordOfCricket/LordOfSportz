# PHASE 5D.6 — PLAYER SETTINGS & PREFERENCES ARCHITECTURE AUDIT

**Date:** 2026-08-20  
**Status:** ✅ **ARCHITECTURE VERIFIED**

---

## EXECUTIVE SUMMARY

Discovery audit revealed that LOC has a **partial settings infrastructure**. Authentication and session management fully support logout, password changes, and role/type selection. However, persistent user preferences (notification preferences, app settings, privacy) have **no backend model or API**.

**Decision:** Implement settings screen exposing only backend-supported functionality. Do NOT invent preference database schema.

---

## EXISTING BACKEND ARCHITECTURE

### Authentication & Session APIs

**POST /logout**
- URL: `/auth/logout`
- Auth: Required
- Request: None
- Response: 200 (empty)
- Behavior: Invalidates session, clears cookies
- Reachable via: authStore.logout()

**GET /auth/me**
- URL: `/auth/me`
- Auth: Required
- Response: { user: User, mfa?: MfaStatus }
- Behavior: Returns authenticated user + MFA status
- Reachable via: authApi.fetchMe()

**POST /auth/change-password**
- URL: `/auth/change-password`
- Auth: Required
- Request: { currentPassword, newPassword, confirmPassword }
- Response: 200 (empty)
- Behavior: Validates current password, updates to new
- Reachable via: authStore.changePassword()

**PATCH /auth/role**
- URL: `/auth/role`
- Auth: Required
- Request: { role: 'player' | 'staff' }
- Response: { user: User }
- Behavior: Changes authenticated user's role
- Reachable via: authStore.selectRole()

**PATCH /auth/player-type**
- URL: `/auth/player-type`
- Auth: Required
- Request: { playerType: 'team_player' | 'umpire' }
- Response: { user: User }
- Behavior: Changes player type (only when role='player')
- Reachable via: authStore.selectPlayerType()

### Player Profile APIs

**GET /me/player**
- URL: `/me/player`
- Auth: Required
- Response: { player: Player }
- Behavior: Returns authenticated player profile
- Reachable via: playerApi.fetchMyPlayer()

**PATCH /me/player**
- URL: `/me/player`
- Auth: Required
- Request: Partial Player fields
- Response: { player: Player }
- Behavior: Updates player profile
- Reachable via: authStore.updatePlayer()

**POST /me/player/photo**
- URL: `/me/player/photo`
- Auth: Required
- Request: multipart/form-data (photo)
- Response: { player: Player }
- Behavior: Uploads profile photo
- Reachable via: usePhotoUpload()

### What DOES NOT Exist

❌ **Notification Preferences Table**
- No database schema for notification preferences
- No API endpoints for notification settings
- No filtering/muting mechanism on backend

❌ **User Preferences Table**
- No settings/preferences database table
- No app configuration storage
- No personalization API

❌ **Privacy/Account Settings**
- No data deletion APIs
- No privacy controls
- No account deactivation

❌ **Version/Build Info APIs**
- Version only in package.json
- No /info or /version endpoints
- Must use expo-constants on mobile

---

## MOBILE IMPLEMENTATION STATUS

### Existing Utilities

**authStore (Zustand)**
```typescript
logout: () => Promise<void> — calls API, clears session, resets state
changePassword: (current, new, confirm) => Promise<void> — changes password
```

**Auth Hooks**
```typescript
useAuth() — returns current user, status, error from authStore
```

**Player API**
```typescript
fetchMyPlayer() — GET /me/player
updatePlayer(fields) — PATCH /me/player
```

### Existing Screens

✅ Profile screen (mobile/app/(tabs)/profile.tsx)
- Displays player info
- Allows photo upload
- Shows career statistics
- Has "Edit Profile" functionality (PATCH /me/player)

### Missing for Phase 5D.6

❌ Settings screen
❌ Settings navigation/routing
❌ Change password UI
❌ Logout UI
❌ Account info display

---

## CAPABILITY MATRIX — WHAT CAN BE IMPLEMENTED

| Setting | Backend | Mobile UI | Status | Action |
|---------|---------|-----------|--------|--------|
| **Account Info** | ✅ GET /auth/me | ❌ Need to build | BUILDABLE | Display user email/name |
| **Change Password** | ✅ POST /auth/change-password | ❌ Need to build | BUILDABLE | Form + validation |
| **Logout** | ✅ POST /logout | ❌ Need to build | BUILDABLE | Button + confirmation |
| **Edit Profile Link** | ✅ Existing screen | ✅ Existing | EXISTS | Link to profile screen |
| **Profile Photo Link** | ✅ Existing screen | ✅ Existing | EXISTS | Link to profile screen |
| **App Version** | ✅ In package.json | ✅ expo-constants | BUILDABLE | Display "v1.0.0" |
| **Notification Prefs** | ❌ NOT AVAILABLE | N/A | SKIP | No backend support |
| **App Settings** | ❌ NOT AVAILABLE | N/A | SKIP | No backend support |
| **Privacy Settings** | ❌ NOT AVAILABLE | N/A | SKIP | No backend support |
| **Account Deletion** | ❌ NOT AVAILABLE | N/A | SKIP | No backend support |
| **Session Management** | ✅ Session Cookie | ✅ HTTP-only | EXISTS | Automatic via API client |

---

## ARCHITECTURAL CONSTRAINTS

### What CANNOT Be Done (No Backend Support)

1. **Notification Preferences** — Backend sends notifications but has no preference model
   - No toggle for notification types
   - No mute periods
   - Would require new database table + APIs

2. **App Preferences** — No persistent user settings
   - No theme preference (app forces light/dark based on device)
   - No language preference
   - No font size preference
   - Would require new database table + APIs

3. **Privacy Controls** — No data management APIs
   - No data export
   - No data deletion
   - No account deactivation
   - Would require new GDPR/privacy policies + backend implementation

4. **Two-Factor Authentication Settings** — MFA is read-only via GET /auth/me
   - MFA status displayed but not configured via mobile
   - Configuration only via web (future phase)
   - Would require new endpoints for MFA enrollment/management

---

## PROPOSED SETTINGS SCREEN STRUCTURE

### Sections to Implement

**1. ACCOUNT SECTION**
- Email (read-only, from GET /auth/me)
- User name (read-only, from GET /auth/me)
- "Edit Profile" button → Navigate to existing profile screen

**2. SECURITY SECTION**
- "Change Password" → Modal/Form with validation
  - Calls: POST /auth/change-password
  - Validates password strength
  - Shows success/error

**3. INFORMATION SECTION**
- App Version: "1.0.0" (from expo-constants)
- "About" button → Could link to about page if it exists (check later)

**4. SESSION SECTION**
- "Logout" button → Confirmation dialog
  - Calls: POST /logout (via authStore)
  - Clears auth state
  - Navigates to login

---

## IMPLEMENTATION PLAN

### Files to Create

1. **mobile/app/(tabs)/settings.tsx** — Settings screen
   - Display account info
   - Change password form
   - Logout button
   - App version

2. **mobile/src/hooks/useChangePassword.ts** — Password change mutation hook
   - TanStack Query mutation
   - Error handling
   - Loading state

### Files to Modify

1. **mobile/app/(tabs)/_layout.tsx** — Add settings tab to navigation
2. **mobile/app/(tabs)/profile.tsx** — Add "Go to Settings" button (optional, can be settings navigation)

---

## AUTHENTICATION & SESSION BEHAVIOR

### Logout Flow

```
User taps "Logout"
        ↓
Show confirmation dialog
        ↓
User confirms
        ↓
Call authStore.logout()
        ↓
POST /logout (server invalidates session)
        ↓
Clear session cookie
        ↓
Reset Zustand auth state to null
        ↓
Clear TanStack Query cache (authenticated queries)
        ↓
Reset navigation stack
        ↓
Render login screen
```

### Security Implications

✅ **Session invalidated server-side** (POST /logout invalidates cookies)
✅ **Local auth state cleared** (set user: null)
✅ **HTTP-only cookies** (cannot be accessed via JS)
✅ **Cache cleared** (authenticated queries purged from TanStack Query)
✅ **Navigation reset** (no back button to authenticated screens)

---

## CACHE STRATEGY

### Queries That Should Clear on Logout

- All authenticated user queries
- All player profile queries
- All booking queries
- All match queries
- All notification queries
- All team queries

### Implementation

authStore.logout() already calls `api.clearSession()` which should handle:
1. Clearing Zustand auth state
2. Invalidating TanStack Query cache

**Verify:** Check if TanStack Query cache is truly cleared on logout. If not, add explicit invalidation.

---

## SECURITY CONSIDERATIONS

### ✅ What Is Secure

- Logout invalidates server session (POST /logout)
- HTTP-only cookies prevent XSS token theft
- Authenticated API calls fail after logout (no valid session)
- Zustand state reset prevents accidental access

### ⚠️ Potential Concern

- If TanStack Query cache is not cleared, stale authenticated data might be accessible
- Solution: authStore.logout() must invalidate all TanStack Query caches
- Verify: Check api.clearSession() implementation

### ✅ Change Password Security

- Current password verified server-side
- No password transmitted in plain text (HTTPS only)
- Session remains active (user stays logged in after password change)
- Backend validation authoritative

---

## TESTING STRATEGY

### Unit Tests

- Change password validation (empty, mismatch, too short)
- Logout state reset
- Cache clearing on logout

### Integration Tests

- Change password end-to-end
- Logout end-to-end
- Navigation after logout
- Back button prevention after logout

### Manual Tests

- Tap logout → confirm → redirected to login ✓
- Back button from login doesn't return to settings ✓
- Change password → success/error handling ✓
- Refresh app after logout → login screen ✓
- Settings screen accessibility ✓

---

## KNOWN LIMITATIONS

### 1. No Notification Preferences

Users cannot configure notification behavior. Backend sends notifications but has no preference model. This is a limitation of the backend architecture, not mobile.

**Impact:** All players receive all notifications. Future phase can add backend support.

### 2. No App Preferences

No theme, language, or font size settings. These would require either:
- A backend preferences table (scalable, multi-device sync)
- AsyncStorage persistence (local-only, device-specific)

**Current Decision:** Don't implement. If needed in future, use AsyncStorage for local preferences only.

### 3. No MFA Management

MFA enrollment/configuration available only on web. Mobile shows MFA status but cannot enroll/disable/manage.

**Impact:** Players must use web for MFA setup. Phone only shows status.

### 4. No Data Deletion

No "Delete Account" or "Delete Data" options. Backend has no GDPR-compliant deletion flow.

**Impact:** Players cannot self-delete accounts via mobile. Would require legal/admin coordination.

---

## PRODUCTION READINESS BASELINE

### Can Proceed With

✅ Account info display
✅ Change password UI
✅ Logout button
✅ App version display

### Should NOT Implement

❌ Notification preferences (no backend support)
❌ App settings (no backend support)
❌ Privacy controls (no backend support)
❌ Account deletion (no backend support)

---

## RECOMMENDATION

Implement Phase 5D.6 as a **minimal Settings screen** focusing on account management and logout. This is appropriate for the current backend architecture.

**Future considerations:**
- Phase 6X: Add backend preference table if notification/app settings needed
- Phase 6Y: Implement GDPR-compliant account deletion
- Phase 6Z: Add MFA enrollment/management endpoints

---

## NEXT STEPS

1. ✅ Architecture audit complete
2. ⏳ Implement settings screen (change password, logout, account info)
3. ⏳ Add navigation to settings
4. ⏳ Test thoroughly (especially logout flow)
5. ⏳ Security audit
6. ⏳ Final production audit

**PROCEED WITH IMPLEMENTATION** — Backend supports required functionality.
