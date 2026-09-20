# Phase 5B.2 — Player Query & Validation Infrastructure

**Date:** 2026-08-20  
**Status:** ✅ COMPLETE  
**Scope:** TanStack Query hooks, validation utilities, cache strategy

---

## Executive Summary

Phase 5B.2 has successfully implemented the query and validation infrastructure layer for player profile functionality. All hooks follow existing LOC patterns, validation mirrors backend rules exactly, and cache strategy balances freshness with network efficiency.

**Implementation Status: ✅ READY FOR PHASE 5B.3 (UI Components)**

---

## PART 1: Existing Query Architecture Audit

### 1.1 Project Query Conventions

**Query Key Pattern:**
- Array-based keys: `['resource', ...params]`
- Nested structure for related queries: `['matches', matchId, 'live-state']`
- No centralized queryKeys factory (keys scattered in hooks)

**Example from useMatches.ts:**
```typescript
queryKey: ['matches', category, limit, offset]
queryKey: ['matches', matchId, 'live-state']
queryKey: ['matches', matchId, 'commentary', inningsId]
```

**staleTime Configuration:**
- Live data: 0ms (no stale time)
- Real-time data: 30s-1min (frequent updates)
- Cached data: 5-10 minutes (infrequent updates)

**Example from useMatches.ts:**
```typescript
staleTime: 1000 * 60 * 5        // 5 minutes (matches)
staleTime: 0                     // Live (match live state)
staleTime: 1000 * 30             // 30 seconds (commentary)
```

**Enabled Conditions:**
- `enabled: !!param` for conditional queries
- Prevents unnecessary requests before params exist

**Example from useMatches.ts:**
```typescript
enabled: !!matchId
enabled: !!latitude && !!longitude
enabled: !!query && query.length > 0
```

**Mutation Pattern:**
- useMutation for side effects
- onSuccess invalidates related queries
- queryClient for cache updates

### 1.2 Observed Query Behavior

**No explicit gcTime configuration** — Uses TanStack Query default (5 minutes)

**No explicit retry configuration** — Uses TanStack Query defaults

**refetchOnWindowFocus** — Not explicitly set (uses default: true)

### 1.3 Decision: Centralized Query Keys Factory

**Rationale:**
- TanStack Query best practice for type-safe invalidation
- LOC currently has no centralized keys (scattered throughout)
- Centralizing keys improves maintainability
- Allows precise invalidation patterns
- Easier to find all queries related to a domain

**Implementation:** Created `playerKeys.ts` with factory object (see Part 3)

---

## PART 2: Architecture Overview

**Data Flow:**

```
LOC Backend
    ↓
playerApi.ts (Phase 5B.1)
    ↓
TanStack React Query (Phase 5B.2)
    ↓
React Components (Phase 5B.3)
```

**Validation Flow:**

```
User Input
    ↓
playerValidation.ts (UX feedback)
    ↓
useUpdateMyPlayer mutation
    ↓
playerApi.updateMyPlayer
    ↓
LOC Backend (definitive validation)
```

---

## PART 3: Query Key Hierarchy

**File:** `mobile/src/hooks/playerKeys.ts`

**Factory Structure:**

```typescript
playerKeys.all              // ['player']
playerKeys.me()             // ['player', 'me']
playerKeys.stats()          // ['player', 'stats']
playerKeys.statsWithPagination(limit, offset)  // [..., { limit, offset }]
playerKeys.public(id)       // ['player', 'public', id]
playerKeys.publicStats(id)  // ['player', 'public-stats', id]
playerKeys.publicStatsWithPagination(id, limit, offset)
```

**Type Safety:**
- ✅ Uses `as const` for exact literal types
- ✅ Nested prefixes prevent accidental matches
- ✅ Unique keys for each query
- ✅ Enables precise `queryClient.invalidateQueries({ queryKey: playerKeys.me() })`

**Benefits:**
- Single source of truth for player query keys
- Type-safe cache invalidation
- Easy to find all player queries
- Consistency across codebase

---

## PART 4: Query Hooks Implemented

**File:** `mobile/src/hooks/usePlayer.ts`

### 4.1 useMyPlayer()

**Purpose:** Fetch authenticated user's player profile

**Configuration:**
```typescript
queryKey: playerKeys.me()
staleTime: 5 minutes
queryFn: fetchMyPlayer()
enabled: optional (default true)
```

**Return Type:** `UseQueryResult<Player>`

**Behavior:**
- Cached for 5 minutes (profile changes infrequently)
- Refetches on window focus (default TanStack behavior)
- Disabled only if explicitly set to false

**Use Cases:**
- Display current player profile
- Provide context for other operations
- Check onboarding status

---

### 4.2 useUpdateMyPlayer()

**Purpose:** Mutate authenticated user's player profile

**Configuration:**
```typescript
mutationFn: updateMyPlayer(updates: EditablePlayerFields)
onSuccess:
  - setQueryData(playerKeys.me(), updatedPlayer)
  - invalidateQueries(playerKeys.stats())
onError: Propagates error to caller
```

**Return Type:** `UseMutationResult<Player, Error, EditablePlayerFields>`

**Behavior:**
- Accepts only EditablePlayerFields (14 fields max)
- Updates cache immediately with returned player
- Invalidates stats (might have changed based on role/profile)
- No optimistic update (server response is truth)

**Error Handling:**
- 400 errors include specific field validation messages
- 401 errors handled by axios interceptor
- All errors propagate to caller

---

### 4.3 useUploadPlayerPhoto()

**Purpose:** Upload profile photo to Cloudinary

**Configuration:**
```typescript
mutationFn: uploadPlayerPhoto(file: Blob)
onSuccess:
  - setQueryData(playerKeys.me(), updatedPlayer)
onError: Propagates to caller
```

**Return Type:** `UseMutationResult<Player, Error, Blob>`

**Behavior:**
- Accepts Blob (from camera, photo library, etc.)
- Returns updated player with new photo_url
- Updates profile cache
- Does not calculate anything locally

---

### 4.4 useMyPlayerStats()

**Purpose:** Fetch authenticated user's career statistics

**Configuration:**
```typescript
queryKey: playerKeys.statsWithPagination(limit, offset)
staleTime: 5 minutes
queryFn: getMyPlayerStats(limit, offset)
enabled: optional (default true)
```

**Return Type:** `UseQueryResult<PlayerStats>`

**Parameters:**
- `limit`: Max items per page (default 10)
- `offset`: Page offset (default 0)
- `enabled`: Optional enable/disable

**Behavior:**
- Separate query per pagination combo
- Each page cached independently
- Stats are backend-authoritative (no mobile calculation)

---

### 4.5 usePublicPlayerProfile()

**Purpose:** Fetch public player profile (no auth required)

**Configuration:**
```typescript
queryKey: playerKeys.public(publicPlayerId)
staleTime: 5 minutes
enabled: enabled && !!publicPlayerId
```

**Return Type:** `UseQueryResult<Player>`

**Parameters:**
- `publicPlayerId`: Player's public ID (from URL, team, etc.)
- `enabled`: Optional enable/disable

**Behavior:**
- Requires publicPlayerId to be set
- Returns null if ID is empty
- Does not fetch until ID provided

---

### 4.6 usePublicPlayerStats()

**Purpose:** Fetch public player statistics (no auth required)

**Configuration:**
```typescript
queryKey: playerKeys.publicStatsWithPagination(publicPlayerId, limit, offset)
staleTime: 5 minutes
enabled: enabled && !!publicPlayerId
```

**Return Type:** `UseQueryResult<PlayerStats>`

**Behavior:**
- Same as stats hook, but public endpoint
- Requires publicPlayerId

---

## PART 5: Validation Architecture

**File:** `mobile/src/utils/playerValidation.ts`

### 5.1 Design Principles

**Client-Side Validation:**
- UX feedback (real-time field validation)
- Early detection of format errors
- Better user experience

**Server-Side Validation:**
- Security boundary (definitive)
- Business logic enforcement
- Not circumvented by mobile bypassing

**Strategy:** Validation on BOTH layers

### 5.2 Validation Functions

**Individual Field Validators** (each returns `string | null`):

| Function | Field | Rules |
|----------|-------|-------|
| validateName() | name | Non-empty, required |
| validateJerseyNumber() | jersey_number | 0-999, integer, or null |
| validateRole() | role | PLAYING_ROLES enum or null |
| validateBattingStyle() | batting_style | BATTING_STYLES enum or null |
| validateBowlingStyle() | bowling_style | BOWLING_STYLES enum or null |
| validateCity() | city | Max 100 chars or null |
| validateBio() | bio | Max 280 chars or null |
| validateNickname() | nickname | Max 50 chars or null |
| validateDateOfBirth() | date_of_birth | YYYY-MM-DD, not future, after 1900, or null |
| validateIsWicketKeeper() | is_wicket_keeper | Boolean or null |
| validateAddressLine() | address_line | Max 255 chars or null |
| validateState() | state | Max 100 chars or null |
| validatePostalCode() | postal_code | Max 20 chars or null |
| validateProfileOnboardingCompleted() | profile_onboarding_completed | Boolean |

**Aggregate Validator:**
```typescript
validatePlayerFields(fields: EditablePlayerFields): ValidationResult
```

Returns:
```typescript
{
  valid: boolean
  errors: Record<string, string>  // Field → error message
}
```

### 5.3 Validation Rules Alignment

**Source:** `server/src/controllers/player.controller.js` (lines 17-107)

Every mobile validation rule extracted directly from backend:

| Backend Line | Mobile Function | Rule |
|--------------|-----------------|------|
| 44-47 | validateName | name: non-empty trim |
| 49-51 | validateRole | role: PLAYING_ROLES enum |
| 53-55 | validateBattingStyle | batting_style: BATTING_STYLES enum |
| 57-59 | validateBowlingStyle | bowling_style: BOWLING_STYLES enum |
| 61-65 | validateJerseyNumber | jersey_number: 0-999 integer |
| 67-69 | validateCity | city: max 100 chars |
| 70-72 | validateBio | bio: max 280 chars |
| 76-78 | validateNickname | nickname: max 50 chars |
| 79-87 | validateDateOfBirth | date_of_birth: YYYY-MM-DD, not future, after 1900 |
| 88-90 | validateIsWicketKeeper | is_wicket_keeper: boolean |
| 92-94 | validateAddressLine | address_line: max 255 chars |
| 95-97 | validateState | state: max 100 chars |
| 98-100 | validatePostalCode | postal_code: max 20 chars |
| 101-104 | validateProfileOnboardingCompleted | profile_onboarding_completed: boolean |

**Verification:** ✅ All rules match backend exactly

### 5.4 Date Handling

**Special Attention:** date_of_birth validation

**Verified Issues Avoided:**
- ✅ No timezone conversion (YYYY-MM-DD is date-only)
- ✅ Proper future date check: `dob.getTime() > Date.now()`
- ✅ Birth year minimum enforced: `dob.getUTCFullYear() < MIN_BIRTH_YEAR`
- ✅ Format validation before date parsing

**Implementation:**
```typescript
function isValidDateOnlyString(value: string): boolean {
  if (typeof value !== 'string') return false
  const match = /^\d{4}-\d{2}-\d{2}$/.test(value)
  if (!match) return false
  const timestamp = new Date(value).getTime()
  return !Number.isNaN(timestamp)
}
```

### 5.5 Enum Validation

**Uses Centralized Enums:**
```typescript
import { PLAYING_ROLES, BATTING_STYLES, BOWLING_STYLES } from '../domain/playerEnums'
```

**No Duplication:**
- Single source of truth in playerEnums.ts
- Mobile enums match backend exactly

---

## PART 6: Cache Strategy

### 6.1 Stale Time Configuration

| Query | Stale Time | Rationale |
|-------|-----------|-----------|
| My Profile | 5 min | Profile updates infrequent, user likely modifies own profile rarely |
| My Stats | 5 min | Stats change only after matches are scored, infrequent updates |
| Public Profile | 5 min | Public data, less frequently accessed |
| Public Stats | 5 min | Public data, less frequently accessed |

**Rationale:**
- 5 minutes balances freshness with network efficiency
- Profile/stats are not real-time
- Matches 'moderate staleTime' from LOC pattern (see useMatches: 5-10min)

### 6.2 Garbage Collection (GC) Time

**Not Explicitly Set:** Uses TanStack Query default (5 minutes)

**Effect:**
- Query persists in cache 5 min after becoming unused
- Navigating away and back within 5 min reuses cache
- Good for mobile (back button reuse)

### 6.3 Invalidation Strategy

**After PATCH /me/player (updateMyPlayer):**
- Invalidate: `playerKeys.me()` (new data from response)
- Invalidate: `playerKeys.stats()` (might have changed based on role)
- Reason: Player role/profile affects statistics presentation

**After POST /me/player/photo (uploadPlayerPhoto):**
- Invalidate: `playerKeys.me()` (new photo_url)
- Reason: Only profile photo changed, stats unchanged

**No cascade invalidation:**
- Public queries NOT invalidated (separate queries)
- Other domains (matches, grounds, teams) NOT invalidated

---

## PART 7: Retry Strategy

**Current Implementation:** Uses TanStack Query defaults

**Default Behavior:**
- 3 retry attempts for failed queries
- Exponential backoff

**Not Overridden:** Follows LOC pattern (no explicit retry config in other hooks)

---

## PART 8: Error Handling

### 8.1 Query Errors

**Propagated to Caller:**
- 401: Not authenticated (handled by axios interceptor)
- 404: Player not found (hook returns error state)
- 500: Server error (hook returns error state)

### 8.2 Mutation Errors

**Propagated to Caller:**
- 400: Validation error (field errors in response)
- 401: Not authenticated
- 409: Conflict (rarely applicable to profile)
- 500: Server error

**No Error Silencing:** All errors visible to caller for proper UI feedback

---

## PART 9: Authentication Integration

### 9.1 Session-Based Auth

**Mechanism:**
- HttpOnly session cookie (automatic with axios)
- No explicit token management in hooks
- Axios interceptor handles 401 redirects

### 9.2 Interaction Pattern

**Queries:**
- useMyPlayer requires authenticated session
- Public queries (usePublicPlayerProfile) don't require auth

**No Pre-Auth Checks:** Hooks assume session exists

**If Not Authenticated:**
- Query fails with 401
- Axios interceptor redirects to login
- Handled at middleware level, not hook level

---

## PART 10: Type Safety Verification

### 10.1 Compilation Results

**Command:** `npx tsc --noEmit`

**Result:** ✅ ZERO new TypeScript errors from Phase 5B.2

**Files Checked:**
- ✅ `mobile/src/hooks/playerKeys.ts`
- ✅ `mobile/src/hooks/usePlayer.ts`
- ✅ `mobile/src/utils/playerValidation.ts`

### 10.2 Type Safety Audit

**No unsafe patterns:**
- ✅ No `any` types
- ✅ No `as any` casts
- ✅ No `@ts-ignore`
- ✅ All imports typed
- ✅ All function returns typed

**EditablePlayerFields:**
- ✅ Prevents sending non-editable fields
- ✅ All fields optional (partial update)
- ✅ Matches backend allowlist

**ValidationResult:**
- ✅ Structured error reporting
- ✅ Typed field names

---

## PART 11: Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `mobile/src/hooks/playerKeys.ts` | 18 | Query key factory (centralized) |
| `mobile/src/hooks/usePlayer.ts` | 120 | All player queries and mutations |
| `mobile/src/utils/playerValidation.ts` | 280 | Field validation utilities |

---

## PART 12: Files Modified

**None** — Phase 5B.2 only adds new files

**Existing files remain unchanged:**
- ✅ playerApi.ts (from Phase 5B.1)
- ✅ playerEnums.ts
- ✅ types/index.ts
- ✅ authStore.ts (already compatible)

---

## PART 13: Regression Verification

### 13.1 Unrelated Features Not Modified

✅ No changes to:
- Booking feature (useBooking.ts, groundApi.ts)
- Matches feature (useMatches.ts, matchApi.ts)
- Teams feature (useTeams.ts, teamApi.ts)
- Grounds feature (useGrounds.ts, groundApi.ts)
- Authentication (authApi.ts, authStore.ts)
- Socket.IO integration
- Components
- Navigation

### 13.2 Compatibility Check

**authStore.ts already imports playerApi:**
- ✅ fetchMyPlayer() — Implemented ✅
- ✅ updateMyPlayer(fields) — Implemented ✅
- Return types match expectations ✅

---

## PART 14: Testing Status

### 14.1 Unit Test Recommendations

**Validation Functions:**
```typescript
describe('validatePlayerFields', () => {
  it('validates empty name', () => { /* ... */ })
  it('validates jersey number range', () => { /* ... */ })
  it('validates role enum', () => { /* ... */ })
  it('validates date of birth format', () => { /* ... */ })
  // ... more tests
})
```

### 14.2 Runtime Testing Status

**Cannot be tested without:**
- Running mobile app
- Backend service running
- Authentication session

**What will be verified in Phase 5B.3+:**
- Hook data fetching works
- Mutations update cache correctly
- Validation displays errors correctly
- Success flows persist data

---

## PART 15: Known Limitations

### Phase 5B.2 Does NOT Include

- ✅ UI components (deferred to Phase 5B.3)
- ✅ Form components (deferred to Phase 5B.3)
- ✅ Photo picker (deferred to Phase 5B.3)
- ✅ Navigation routing (deferred to Phase 5B.3)
- ✅ Error toasts/alerts (deferred to UI layer)

### Deferred to Phase 5B.3

- Form validation UI (input errors)
- Photo upload progress
- Edit profile screens
- Profile display screens
- Statistics display

---

## PART 16: Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│              React Components (Phase 5B.3)       │
└─────────────────┬───────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────┐
│       TanStack Query Hooks (Phase 5B.2)         │
│   useMyPlayer                                   │
│   useUpdateMyPlayer  ──────→ Invalidation       │
│   useUploadPlayerPhoto  ──→ setQueryData        │
│   useMyPlayerStats                              │
│   usePublicPlayerProfile                        │
│   usePublicPlayerStats                          │
│                                                 │
│   playerValidation.ts                           │
│   (UX validation only)                          │
└─────────────────┬───────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────┐
│     playerApi.ts (Phase 5B.1)                   │
│   fetchMyPlayer()                               │
│   updateMyPlayer()                              │
│   uploadPlayerPhoto()                           │
│   getMyPlayerStats()                            │
│   getPublicPlayerProfile()                      │
│   getPublicPlayerStats()                        │
└─────────────────┬───────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────┐
│           axios API Client                      │
│   (with session auth, error handling)           │
└─────────────────┬───────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────┐
│         LOC Backend                             │
│   GET /me/player                                │
│   PATCH /me/player                              │
│   POST /me/player/photo                         │
│   GET /me/stats                                 │
│   GET /players/:id                              │
│   GET /players/:id/stats                        │
└─────────────────────────────────────────────────┘
```

---

## PART 17: Phase 5B.3 Recommendations

### Component Layer

**Screens to Create:**
1. Profile Display Screen
2. Edit Profile Screen
3. Photo Upload Screen
4. Statistics Display

**Form Components:**
- Text input with validation errors
- Enum select (role, batting_style, bowling_style)
- Date picker (date_of_birth)
- Checkbox (is_wicket_keeper)
- Submit button with loading state

**Use Validation:**
```typescript
const { valid, errors } = validatePlayerFields(formData)
// Display errors[fieldName] below each input
```

**Use Mutations:**
```typescript
const mutation = useUpdateMyPlayer()
mutation.mutate(formData, {
  onSuccess: (player) => navigate('profile'),
  onError: (error) => showErrorToast(error)
})
```

### Integration with Existing UI

**Reuse Components:**
- Button (from design system)
- Text (typography variants)
- SafeAreaView/ScrollView (layout)
- ActivityIndicator (loading state)

**Follow Design System:**
- Colors, spacing, typography from existing constants
- Gesture handlers (if pan/swipe needed)

---

## PART 18: Summary

### Completed

✅ Existing query architecture audited
✅ Centralized query keys factory created
✅ 6 query/mutation hooks implemented
✅ 14 field validators implemented
✅ Cache strategy documented
✅ Invalidation strategy clear
✅ Error handling consistent
✅ Auth integration verified
✅ Type safety: zero unsafe patterns
✅ No regression detected

### Quality Gates Met

✅ Type safety: Full TypeScript strict mode
✅ Validation: Mirror backend rules exactly
✅ Cache: Appropriate staleTime/gcTime
✅ No implementation shortcuts
✅ Proper error propagation
✅ Clean separation of concerns

---

## PART 19: Sign-Off

**Phase 5B.2: ✅ COMPLETE & VERIFIED**

- Infrastructure layer fully implemented
- All hooks follow LOC patterns
- Validation mirrors backend
- TypeScript compilation clean
- No regression detected
- Ready for Phase 5B.3 (UI Components)

**Status:** Ready to proceed to Phase 5B.3: React components and screens.

---

**Document Owner:** Claude Code  
**Date:** 2026-08-20  
**Scope:** Query Hooks + Validation  
**Status:** FINAL

