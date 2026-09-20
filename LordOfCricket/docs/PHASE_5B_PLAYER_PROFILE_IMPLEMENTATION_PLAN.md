# Phase 5B — Player Profile Implementation Plan

**Date:** 2026-08-20  
**Status:** READY FOR IMPLEMENTATION  
**Scope:** Mobile player profile screens, hooks, and state management

---

## Executive Summary

Phase 5B delivers **three core player profile screens** to LOC mobile:

1. **My Player Profile** — Read-only profile display with action buttons
2. **Edit Profile** — Full profile editing form (14 editable fields)
3. **Upload Photo** — Camera/gallery photo capture with Cloudinary upload

All backend APIs are verified production-ready (Phase 5A audit complete). Mobile work is **zero-impact feature addition** — no backend changes, no refactoring, no existing screen modifications.

**Implementation follows established Phase 4B patterns:**
- TanStack React Query for server state (caching, invalidation)
- Zustand auth state (read-only integration)
- Field-level validation matching backend
- Idempotent mutations with error handling
- Socket.IO integration for real-time updates (prep only)

---

## PART 1: Implementation Sequence

### **STEP 1: Create Type Definitions**
**File:** `mobile/src/types/index.ts`

**Add:**
```typescript
// Player profile object (from GET /me/player)
export interface Player {
  id: number
  publicPlayerId: string
  userId: number
  teamId?: number | null
  name: string
  role?: 'BATSMAN' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKET_KEEPER' | 'WICKET_KEEPER_BATSMAN' | null
  battingStyle?: 'RIGHT_HAND' | 'LEFT_HAND' | null
  bowlingStyle?: 'RIGHT_ARM_FAST' | 'RIGHT_ARM_MEDIUM' | 'RIGHT_ARM_OFF_BREAK' | 'RIGHT_ARM_LEG_BREAK' | 'LEFT_ARM_FAST' | 'LEFT_ARM_MEDIUM' | 'LEFT_ARM_ORTHODOX' | 'LEFT_ARM_WRIST_SPIN' | 'NONE' | null
  jerseyNumber?: number | null
  photoUrl?: string | null
  city?: string | null
  bio?: string | null
  nickname?: string | null
  dateOfBirth?: string | null // YYYY-MM-DD
  isWicketKeeper?: boolean
  addressLine?: string | null
  state?: string | null
  postalCode?: string | null
  profileOnboardingCompleted: boolean
  createdAt: string
  updatedAt: string
}

// Editable fields for PATCH /me/player
export interface EditablePlayerFields {
  name?: string
  jerseyNumber?: number | null
  role?: string | null
  battingStyle?: string | null
  bowlingStyle?: string | null
  city?: string | null
  bio?: string | null
  nickname?: string | null
  dateOfBirth?: string | null // YYYY-MM-DD
  isWicketKeeper?: boolean
  addressLine?: string | null
  state?: string | null
  postalCode?: string | null
  profileOnboardingCompleted?: boolean
}

// Career statistics
export interface CareerStats {
  batting?: {
    runs: number
    average: number
    strikeRate: number
    ballsFaced: number
    matchesPlayed: number
  }
  bowling?: {
    wickets: number
    average: number
    economyRate: number
    oversBowled: number
    strikeRate: number
  }
}

// Player statistics response (GET /players/:id/stats or GET /me/stats)
export interface PlayerStats {
  career: CareerStats
  recentForm: PerformanceData[]
  matchHistory: {
    items: PerformanceData[]
    total: number
  }
}

// Performance data for a single match
export interface PerformanceData {
  matchId: string
  matchDate: string
  opponent: string
  result: 'WIN' | 'LOSS' | 'DRAW' | 'NO_RESULT'
  batting?: {
    runs: number
    ballsFaced: number
    wickets?: number
  }
  bowling?: {
    wickets: number
    runs: number
    overs: number
    economy: number
  }
}

// Photo upload response
export interface PhotoUploadResponse {
  player: Player
}
```

---

### **STEP 2: Create API Service Methods**
**File:** `mobile/src/services/groundApi.ts` (extend existing file)

**Add after existing booking methods:**
```typescript
// Player Profile APIs

export async function getMyPlayer(): Promise<{ player: Player }> {
  const response = await apiClient.get('/me/player')
  return response.data
}

export async function updateMyPlayer(updates: EditablePlayerFields): Promise<{ player: Player }> {
  const response = await apiClient.patch('/me/player', updates)
  return response.data
}

export async function uploadPlayerPhoto(file: Blob): Promise<{ player: Player }> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await apiClient.post('/me/player/photo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

export async function getPlayerStats(limit: number = 20, offset: number = 0): Promise<PlayerStats> {
  const response = await apiClient.get(`/me/stats?limit=${limit}&offset=${offset}`)
  return response.data
}

export async function getPublicPlayerInfo(publicPlayerId: string): Promise<{ player: Player }> {
  const response = await apiClient.get(`/players/${publicPlayerId}`)
  return response.data
}

export async function getPublicPlayerStats(publicPlayerId: string, limit: number = 20, offset: number = 0): Promise<PlayerStats> {
  const response = await apiClient.get(`/players/${publicPlayerId}/stats?limit=${limit}&offset=${offset}`)
  return response.data
}
```

---

### **STEP 3: Create React Query Hooks**
**File:** `mobile/src/hooks/usePlayerProfile.ts` (new file)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Player, EditablePlayerFields, PlayerStats } from '../types'
import * as groundApi from '../services/groundApi'

/**
 * Fetch authenticated user's player profile.
 * Cached with 5-minute stale time.
 */
export function useMyPlayerProfile(enabled = true) {
  return useQuery({
    queryKey: ['myPlayerProfile'],
    queryFn: async () => {
      const response = await groundApi.getMyPlayer()
      return response.player as Player
    },
    enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minute cache
  })
}

/**
 * Update authenticated user's player profile.
 * Supports partial updates (submit only changed fields).
 */
export function useUpdateMyPlayer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updates: EditablePlayerFields) => {
      const response = await groundApi.updateMyPlayer(updates)
      return response.player as Player
    },
    onSuccess: (updatedPlayer) => {
      // Invalidate and update profile cache
      queryClient.setQueryData(['myPlayerProfile'], updatedPlayer)
      // Also invalidate public profile if it exists
      queryClient.invalidateQueries({ queryKey: ['publicPlayerProfile', updatedPlayer.publicPlayerId] })
      queryClient.invalidateQueries({ queryKey: ['playerStats'] })
    },
  })
}

/**
 * Upload player profile photo.
 * File accepted from camera or photo library.
 */
export function useUploadPlayerPhoto() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (file: Blob) => {
      const response = await groundApi.uploadPlayerPhoto(file)
      return response.player as Player
    },
    onSuccess: (updatedPlayer) => {
      queryClient.setQueryData(['myPlayerProfile'], updatedPlayer)
    },
  })
}

/**
 * Fetch authenticated user's statistics.
 * Career stats, recent form, and paginated match history.
 */
export function useMyPlayerStats(limit: number = 20, offset: number = 0, enabled = true) {
  return useQuery({
    queryKey: ['playerStats', limit, offset],
    queryFn: async () => {
      return await groundApi.getPlayerStats(limit, offset)
    },
    enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minute cache
  })
}

/**
 * Fetch public player profile by publicPlayerId.
 * No authentication required.
 */
export function usePublicPlayerProfile(publicPlayerId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['publicPlayerProfile', publicPlayerId],
    queryFn: async () => {
      if (!publicPlayerId) return null
      const response = await groundApi.getPublicPlayerInfo(publicPlayerId)
      return response.player as Player
    },
    enabled: enabled && !!publicPlayerId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  })
}

/**
 * Fetch public player statistics by publicPlayerId.
 * No authentication required.
 */
export function usePublicPlayerStats(publicPlayerId: string | null, limit: number = 20, offset: number = 0, enabled = true) {
  return useQuery({
    queryKey: ['publicPlayerStats', publicPlayerId, limit, offset],
    queryFn: async () => {
      if (!publicPlayerId) return null
      return await groundApi.getPublicPlayerStats(publicPlayerId, limit, offset)
    },
    enabled: enabled && !!publicPlayerId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  })
}
```

---

### **STEP 4: Create Edit Profile Screen**
**File:** `mobile/app/(tabs)/profile/edit.tsx` (new file)

**Creates:**
- Form with 14 editable fields
- Field-level validation matching backend
- Save button with loading/error states
- Cancel/back navigation
- Photo picker integration

**Key Patterns:**
- Use `useMyPlayerProfile()` to fetch current values
- Use `useUpdateMyPlayer()` for mutations
- Only send changed fields
- Validate before submission (match backend enums)
- Handle 400 errors with field-level error messages

**Dependencies:**
- `react-native-image-picker` or `expo-image-picker`
- Form component from design system
- Validation utilities

---

### **STEP 5: Create Profile Photo Upload Screen**
**File:** `mobile/app/(tabs)/profile/upload-photo.tsx` (new file)

**Creates:**
- Camera/photo library picker
- Photo preview
- Upload button with progress
- Success/error feedback

**Implementation:**
```typescript
export function UploadPhotoScreen() {
  const [selectedFile, setSelectedFile] = useState<Blob | null>(null)
  const uploadMutation = useUploadPlayerPhoto()

  const handlePickImage = async () => {
    // Use expo-image-picker to select from camera or library
    // Convert ImageResult to Blob
    // setSelectedFile(blob)
  }

  const handleUpload = async () => {
    if (!selectedFile) return
    try {
      await uploadMutation.mutateAsync(selectedFile)
      // Navigate back or show success
    } catch (error) {
      // Show error to user
    }
  }

  return (
    <View>
      {/* Photo picker */}
      {/* Preview */}
      {/* Upload button */}
    </View>
  )
}
```

---

### **STEP 6: Create My Profile Screen**
**File:** `mobile/app/(tabs)/profile.tsx` (new file or extend existing)

**Creates:**
- Display authenticated user's profile
- Photo display with edit button
- Profile fields display (read-only)
- Edit Profile button → navigates to edit.tsx
- Upload Photo button → navigates to upload-photo.tsx
- Career statistics section (collapsible)
- Recent form (last 5 matches)
- View Full Stats button

**State Management:**
- `useAuth()` from Zustand for user context
- `useMyPlayerProfile()` for profile data
- `useMyPlayerStats()` for statistics

**Navigation:**
- Edit Profile: `navigation.navigate('profile/edit')`
- Full Stats: Create dedicated stats screen or modal

---

### **STEP 7: Create Statistics Display Component**
**File:** `mobile/src/components/PlayerStatistics.tsx` (new file)

**Displays:**
- Career batting stats (average, strike rate, runs)
- Career bowling stats (wickets, economy, strike rate)
- Recent form (last 5 matches with results)
- Career record (total matches, total runs, total wickets)

**Props:**
```typescript
interface PlayerStatisticsProps {
  stats: PlayerStats
  isLoading: boolean
  error?: Error | null
}
```

---

### **STEP 8: Create Match History Component**
**File:** `mobile/src/components/PlayerMatchHistory.tsx` (new file)

**Displays:**
- Paginated list of player's matches
- Each match item shows:
  - Match date
  - Opponent
  - Result (WIN/LOSS/DRAW)
  - Batting performance (runs, balls faced)
  - Bowling performance (wickets, runs, economy)
- Load more / pagination controls

**Props:**
```typescript
interface PlayerMatchHistoryProps {
  stats: PlayerStats
  isLoading: boolean
  onLoadMore: () => void
  hasMore: boolean
}
```

---

### **STEP 9: Implement Navigation Stack**
**File:** `mobile/app/(tabs)/profile/_layout.tsx` (new file if needed)

**Adds routes:**
- `/profile` — My Player Profile (main screen)
- `/profile/edit` — Edit Profile form
- `/profile/upload-photo` — Photo upload
- `/profile/stats` — Full statistics with pagination

---

### **STEP 10: Add Route to AppRoutes**
**File:** `mobile/app/(tabs)/_layout.tsx`

**Add profile tab** if not already present:
```typescript
<Tabs.Screen
  name="profile"
  options={{
    title: 'Profile',
    tabBarLabel: 'Profile',
    headerShown: true,
  }}
/>
```

---

## PART 2: Field Validation Rules

### Validation Checklist (Match Backend Exactly)

| Field | Type | Validation | Max Length | Nullable |
|-------|------|-----------|-----------|----------|
| name | string | Non-empty | — | NO |
| jerseyNumber | number | 0-999, integer | — | YES |
| role | string | Must be PLAYING_ROLES enum | — | YES |
| battingStyle | string | Must be BATTING_STYLES enum | — | YES |
| bowlingStyle | string | Must be BOWLING_STYLES enum | — | YES |
| city | string | — | 100 chars | YES |
| bio | string | — | 280 chars | YES |
| nickname | string | — | 50 chars | YES |
| dateOfBirth | string (YYYY-MM-DD) | Not future, after 1900 | — | YES |
| isWicketKeeper | boolean | — | — | YES |
| addressLine | string | — | 255 chars | YES |
| state | string | — | 100 chars | YES |
| postalCode | string | — | 20 chars | YES |
| profileOnboardingCompleted | boolean | — | — | YES |

**Validation Implementation:**
```typescript
// mobile/src/utils/playerValidation.ts

export const PLAYING_ROLES = ['BATSMAN', 'BOWLER', 'ALL_ROUNDER', 'WICKET_KEEPER', 'WICKET_KEEPER_BATSMAN']
export const BATTING_STYLES = ['RIGHT_HAND', 'LEFT_HAND']
export const BOWLING_STYLES = ['RIGHT_ARM_FAST', 'RIGHT_ARM_MEDIUM', 'RIGHT_ARM_OFF_BREAK', 'RIGHT_ARM_LEG_BREAK', 'LEFT_ARM_FAST', 'LEFT_ARM_MEDIUM', 'LEFT_ARM_ORTHODOX', 'LEFT_ARM_WRIST_SPIN', 'NONE']

export function validatePlayerFields(fields: EditablePlayerFields): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {}

  if (fields.name !== undefined && !fields.name?.trim()) {
    errors.name = 'Name cannot be empty'
  }

  if (fields.jerseyNumber !== undefined && fields.jerseyNumber !== null) {
    if (!Number.isInteger(fields.jerseyNumber) || fields.jerseyNumber < 0 || fields.jerseyNumber > 999) {
      errors.jerseyNumber = 'Jersey number must be between 0 and 999'
    }
  }

  if (fields.role !== undefined && fields.role !== null && !PLAYING_ROLES.includes(fields.role)) {
    errors.role = `Role must be one of: ${PLAYING_ROLES.join(', ')}`
  }

  if (fields.battingStyle !== undefined && fields.battingStyle !== null && !BATTING_STYLES.includes(fields.battingStyle)) {
    errors.battingStyle = 'Invalid batting style'
  }

  if (fields.bowlingStyle !== undefined && fields.bowlingStyle !== null && !BOWLING_STYLES.includes(fields.bowlingStyle)) {
    errors.bowlingStyle = 'Invalid bowling style'
  }

  if (fields.city !== undefined && fields.city && fields.city.length > 100) {
    errors.city = 'City must be 100 characters or less'
  }

  if (fields.bio !== undefined && fields.bio && fields.bio.length > 280) {
    errors.bio = 'Bio must be 280 characters or less'
  }

  if (fields.nickname !== undefined && fields.nickname && fields.nickname.length > 50) {
    errors.nickname = 'Nickname must be 50 characters or less'
  }

  if (fields.dateOfBirth !== undefined && fields.dateOfBirth !== null) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(fields.dateOfBirth)) {
      errors.dateOfBirth = 'Date must be in YYYY-MM-DD format'
    } else {
      const dob = new Date(fields.dateOfBirth)
      if (dob.getTime() > Date.now()) {
        errors.dateOfBirth = 'Date of birth cannot be in the future'
      }
      if (dob.getUTCFullYear() < 1900) {
        errors.dateOfBirth = 'Date of birth must be after 1900'
      }
    }
  }

  if (fields.addressLine !== undefined && fields.addressLine && fields.addressLine.length > 255) {
    errors.addressLine = 'Address must be 255 characters or less'
  }

  if (fields.state !== undefined && fields.state && fields.state.length > 100) {
    errors.state = 'State must be 100 characters or less'
  }

  if (fields.postalCode !== undefined && fields.postalCode && fields.postalCode.length > 20) {
    errors.postalCode = 'Postal code must be 20 characters or less'
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  }
}
```

---

## PART 3: Design System Integration

### Screens Reuse Existing Components

**My Profile Screen:**
- `SafeAreaView` (existing)
- `ScrollView` (existing)
- `Avatar` component for photo display
- `Button` component for actions
- `Card` component for sections
- `Text` variants for profile fields

**Edit Profile Screen:**
- `TextInput` component
- `Picker`/`Select` for enums
- `DatePickerIOS`/`DatePickerAndroid` for date_of_birth
- `Checkbox` for isWicketKeeper
- `Button` for submit
- Error text display

**Photo Upload Screen:**
- `Image` for preview
- `Button` for camera/gallery
- `ActivityIndicator` for loading

**Statistics Screens:**
- `Card` for stat groups
- `Text` variants for values
- `FlatList` for match history

---

## PART 4: API Error Handling

### Expected Backend Errors

| Status | Scenario | Handling |
|--------|----------|----------|
| 400 | Invalid field value | Display field-level error message |
| 401 | Not authenticated | Redirect to login (Zustand auth state) |
| 404 | Player not found | Show "Profile not found" (rare) |
| 500 | Server error | Show generic error, allow retry |

**Error Display Pattern:**
```typescript
const { mutate, isPending, error } = useUpdateMyPlayer()

const handleSave = () => {
  mutate(updates, {
    onError: (error) => {
      if (error.response?.status === 400) {
        // Show field errors from error.response.data
        setFieldErrors(error.response.data.errors)
      } else {
        // Show generic error toast
        showErrorToast('Failed to save profile')
      }
    },
  })
}
```

---

## PART 5: Caching Strategy

### Query Cache Configuration

| Query | Stale Time | GC Time | Notes |
|-------|-----------|---------|-------|
| myPlayerProfile | 5 min | 10 min | Invalidate on update |
| playerStats | 5 min | 10 min | Invalidate on profile update |
| publicPlayerProfile | 5 min | 10 min | Public data, slower invalidation |
| publicPlayerStats | 5 min | 10 min | Public data, slower invalidation |

### Invalidation Triggers
- Profile update: Invalidate `myPlayerProfile` + `playerStats` + `publicPlayerProfile`
- Photo upload: Invalidate `myPlayerProfile`
- Manual refresh: `queryClient.invalidateQueries()`

---

## PART 6: Testing Checklist

### Unit Tests
- [ ] playerValidation.ts validation functions
- [ ] useMyPlayerProfile hook
- [ ] useUpdateMyPlayer hook
- [ ] useUploadPlayerPhoto hook
- [ ] useMyPlayerStats hook

### Integration Tests
- [ ] Edit Profile form: all field types
- [ ] Photo upload: success and error paths
- [ ] Profile display: reads from query cache
- [ ] Validation: match backend enum values
- [ ] Error handling: 400/401/500 errors

### Manual Testing
- [ ] View my profile (first load, cached load)
- [ ] Edit profile (partial update, full update)
- [ ] Edit profile with validation errors
- [ ] Upload profile photo (camera, gallery)
- [ ] View statistics and match history
- [ ] Pagination in match history
- [ ] Offline behavior (cached data)
- [ ] Network error recovery

---

## PART 7: Implementation Priorities

### PHASE 5B.1: Core Profile (Week 1)
1. Type definitions
2. API service methods
3. React Query hooks
4. My Profile screen (read-only)
5. Basic statistics display

### PHASE 5B.2: Profile Editing (Week 2)
6. Edit Profile form
7. Field validation
8. Save/cancel flows
9. Error handling

### PHASE 5B.3: Photo Upload (Week 2)
10. Photo picker integration
11. Upload screen
12. Progress/success feedback

### PHASE 5B.4: Polish & Testing (Week 3)
13. Design polish (typography, spacing, colors)
14. Accessibility review
15. Performance optimization
16. Manual testing
17. Error scenario testing

---

## PART 8: Architectural Notes

### No Backend Changes Required
✅ All APIs verified production-ready in Phase 5A
✅ No new endpoints needed
✅ No database migrations needed
✅ No business logic changes

### Mobile Architecture Alignment
✅ Reuses TanStack Query patterns from Phase 4B bookings
✅ Reuses Zustand auth integration
✅ Reuses API service structure (groundApi.ts)
✅ Reuses form validation patterns
✅ No new state management required

### Security
✅ Session-based auth (backend handles IDOR)
✅ Enum validation matches backend exactly
✅ No sensitive data in logs
✅ Photo upload via Cloudinary (no direct file storage)

### Performance
✅ 5-minute stale time balances freshness vs requests
✅ 10-minute cache time prevents repeated fetches
✅ Pagination for match history (large data sets)
✅ Query key structure enables precise invalidation

---

## PART 9: Go/No-Go Decision

**Status: ✅ READY TO IMPLEMENT**

- ✅ Backend APIs verified production-ready
- ✅ Type system defined
- ✅ Validation rules documented
- ✅ Architectural patterns established
- ✅ Error handling strategy clear
- ✅ Testing strategy defined
- ✅ No blockers or risks identified

**Next Step:** Begin Phase 5B.1 implementation (type definitions → API service → hooks → My Profile screen)

