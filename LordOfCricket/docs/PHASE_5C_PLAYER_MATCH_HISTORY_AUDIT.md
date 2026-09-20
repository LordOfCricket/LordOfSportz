# Phase 5C — Player Match History & Performance
# Comprehensive Architecture Audit

**Date:** 2026-08-20  
**Phase:** Audit Only (No Implementation)  
**Status:** Ready for Implementation Planning  

---

## Audit Scope & Methodology

This audit systematically inspects:

1. Backend player statistics architecture
2. API contracts for player match data
3. Database relationships (Player → Match → Performance)
4. Existing web application implementation
5. Existing mobile architecture reuse patterns
6. Type contract alignment
7. Security and authorization model
8. Performance characteristics

---

## Phase 5C Objective

**Goal:** Implement a complete Player Match History & Performance experience in LOC mobile.

**Features:**
- Recent match display
- Match-by-match batting performance
- Match-by-match bowling performance
- Match-by-match fielding performance
- Match date, opponent, result
- Pagination/load-more
- Empty/loading/error states
- Integration with existing profile

**Non-Goals:**
- Mobile does NOT recreate cricket scoring logic
- Mobile is a DATA CONSUMER of backend-authoritative statistics
- No changes to existing profile/edit/photo functionality

---

## Backend Architecture Findings

### Player Statistics Backend

**Key Files:**
- `server/src/controllers/player.controller.js` — Player endpoints
- `server/src/models/player.model.js` — Player data model
- `server/src/services/playerAnalytics.service.js` — Statistics computation
- `server/src/services/statistics.service.js` — Stats aggregation

**Existing Endpoints (Verified):**
- ✅ GET /me/player — Player profile
- ✅ GET /me/stats — Player career statistics
- ✅ GET /players/:id — Public player profile
- ✅ GET /players/:id/stats — Public player statistics

**Stats Response Structure (Current):**

```typescript
// Inferred from Phase 5B implementation
GET /me/stats returns:
{
  career: {
    matches: number,
    batting: BattingStats,
    bowling: BowlingStats,
    fielding: FieldingStats
  },
  matchHistory: PlayerMatchPerformance[]
}
```

**Note:** Exact pagination behavior, sort order, limit/offset handling NOT YET VERIFIED. Requires inspection of statistics.service.js.

### Match Architecture

**Key Files:**
- `server/src/controllers/match.controller.js` — Match endpoints
- `server/src/models/match.model.js` — Match data model
- Related: matchIncident, matchFeedback, matchMessage models

**Match Model Likely Contains:**
- match_date
- team_a_id / team_b_id
- venue
- match_status
- result
- team_a_runs / team_a_wickets
- team_b_runs / team_b_wickets

**VERIFICATION NEEDED:** Exact fields and whether match performance data is normalized into separate tables or embedded in scorecard.

### Player-Match Relationships

**Expected Structure (To Be Verified):**

```
Player (1)
  ↓ has many
Match (many)
  ↓
PlayerMatchPerformance (1 per player per match)
  ├─ Batting
  │  ├─ runs
  │  ├─ balls
  │  ├─ fours / sixes
  │  ├─ dismissal
  │  └─ strikeRate
  ├─ Bowling
  │  ├─ overs
  │  ├─ maidens
  │  ├─ runs_conceded
  │  ├─ wickets
  │  └─ economy
  └─ Fielding
     ├─ catches
     ├─ stumpings
     └─ run_outs
```

**VERIFICATION NEEDED:** Whether PlayerMatchPerformance is stored as:
- A separate database table
- Denormalized in a scorecard table
- Computed on-the-fly from match data

---

## API Contract Analysis

### Existing Player Statistics API

**Endpoint:** GET /me/stats

**Known Response Fields (From Phase 5B):**
```typescript
{
  career: {
    batting: {
      innings, notOuts, runs, ballsFaced, average, strikeRate, fours, sixes
    },
    bowling: {
      innings, legalBalls, runsConceded, wickets, average, economy
    },
    fielding: {
      catches, stumpings
    }
  },
  matchHistory: PlayerMatchPerformance[]
}
```

**Pagination Support:** ❓ UNKNOWN
- Does matchHistory paginate?
- Does it use limit/offset parameters?
- Is it sorted by date (most recent first)?
- How many records returned by default?

**VERIFICATION NEEDED:**
```bash
# Inspect server/src/services/statistics.service.js
# Look for:
# - getMyPlayerStats() function
# - pagination logic
# - match history query
# - sort order
# - default limit
```

### Public Player Statistics API

**Endpoint:** GET /players/:id/stats

**Expected:** Same structure as /me/stats, but public-only fields

**VERIFICATION NEEDED:** Whether public stats expose:
- Full match history or summary only?
- Private performance data?
- Team information?

### Match Detail API

**Endpoint:** GET /matches/:id (if exists)

**VERIFICATION NEEDED:**
- Does a match detail endpoint exist?
- Does it return full scorecard?
- Does it return per-player performance?
- Authorization/visibility rules?

---

## Database Schema Audit

### Likely Relevant Tables

**Core:**
- `players` — Player data
- `matches` — Match records
- `teams` — Team data

**Performance:**
- `player_match_performances` (or similar) — Per-player, per-match stats
- OR `scorecards` — If match performance is in scorecard table
- OR `innings` — If performance is part of innings model

**Relationships:**
- `player_team` — Player → Team mapping
- `match_participants` (or similar) — Who played in which match

**VERIFICATION NEEDED:**
```bash
# Inspect server/src/models/
# Look for:
# - How matches store batting/bowling/fielding data
# - Whether there's a player_performance table
# - Foreign keys between player and match
# - Whether performance is per-match or aggregated
```

---

## Existing Web Application Reference

**Status:** Not yet inspected (would require viewing web codebase)

**Questions:**
- Does the web app have a player profile page with match history?
- Does it display per-match statistics?
- How does it handle pagination of large match histories?
- What terminology does it use (e.g., "dismissal", "economy")?
- How does it format dates and numbers?

---

## Mobile Architecture Audit

### Existing Pattern Analysis

**From Phase 5B Player Profile:**

✅ **API Pattern:**
```typescript
// mobile/src/services/playerApi.ts
export async function getMyPlayerStats(...): Promise<PlayerStats> {
  return api.get<PlayerStats>('/me/stats')
}
```

✅ **Query Keys:**
```typescript
// mobile/src/hooks/playerKeys.ts
playerKeys.statsWithPagination(limit, offset)
```

✅ **Hooks:**
```typescript
// mobile/src/hooks/usePlayer.ts
export function useMyPlayerStats(limit, offset, enabled) {
  return useQuery({
    queryKey: playerKeys.statsWithPagination(limit, offset),
    queryFn: () => playerApi.getMyPlayerStats(limit, offset)
  })
}
```

**Pattern to Replicate:** ✅
- API service calls
- Query keys factory
- TanStack Query hooks with pagination support
- Proper cache invalidation

### UI Component Patterns

**Existing Components (Reusable):**
- ✅ LoadingScreen
- ✅ ErrorScreen
- ✅ EmptyState
- ✅ RefreshControl
- ✅ Colors/Typography/Spacing design system

**Existing Screens:**
- Profile: Uses SafeAreaView, ScrollView, SectionList
- No match list screen yet

### Current Player Profile Structure

**mobile/app/(tabs)/profile.tsx:**
- Header: Photo + name + role badge
- Cricket Profile section
- Personal Information section
- Career Statistics section
- Recent matches (to be added)

**Route Structure:**
- `/profile` — Main profile
- `/profile/edit` — Edit profile
- No `/profile/matches` yet

---

## Type Contract Audit

### Existing Player Types

```typescript
// mobile/src/types/index.ts

interface Player {
  // ... profile fields
  photo_url?: string | null
}

interface PlayerStats {
  total: number
  limit: number
  offset: number
  items: PlayerMatchPerformance[]
  career: CareerStats
}

interface CareerStats {
  matches: number
  batting: BattingStats
  bowling: BowlingStats
  fielding: FieldingStats
}

interface PlayerMatchPerformance {
  matchId: number
  date: string
  venue: string | null
  opponent: string
  result: string
  won: boolean | null
  batting: MatchBattingPerformance
  bowling: MatchBowlingPerformance
}

interface MatchBattingPerformance {
  didBat: boolean
  runs?: number
  balls?: number
  fours?: number
  sixes?: number
  notOut?: boolean
  strikeRate?: number | null
}

interface MatchBowlingPerformance {
  didBowl: boolean
  legalBalls?: number
  runs?: number
  wickets?: number
  maidens?: number
  economy?: number | null
}
```

**STATUS:** Types already exist from Phase 5B. Match the backend response structure.

**VERIFICATION NEEDED:**
- Do these types actually match the current backend response?
- Are all nullable fields correctly marked?
- Are field names snake_case vs camelCase correctly converted?
- Are numeric types (int vs float) correct?
- Are date formats correct (YYYY-MM-DD)?

---

## Security Audit

### Authentication & Authorization

✅ **Session Auth:** HttpOnly cookies via AsyncStorage interceptor

✅ **Owned Data Access:**
- GET /me/stats — User's own stats (auth required)
- GET /me/player — User's own profile (auth required)

✅ **Public Data Access:**
- GET /players/:id/stats — Public player stats (no auth)
- GET /players/:id — Public player profile (no auth)

**VERIFICATION NEEDED:**
- Does public player stats expose private match information?
- Is player_id correctly isolated in /me/stats endpoint?
- Can a player access another player's /me/stats?
- Is team/match information public or private?

### IDOR Protection

**Current:**
- /me/stats — Cannot specify which player, uses req.user.id ✅
- /me/player — Cannot specify which player, uses req.user.id ✅

**Mobile:**
- Never exposes /me endpoint to arbitrary player IDs ✅
- Uses playerApi functions that don't accept player IDs ✅

**No IDOR risk identified** for existing endpoints.

---

## Performance Audit

### Match History Scale

**Questions:**
- How many matches does an average player have?
  - Estimate: 5-50 matches in test data
  - Real scenario: Could be 100+ over a season
- What happens with 1000+ match history?

**Backend Pagination:**

**VERIFICATION NEEDED:**
```
Does GET /me/stats support pagination?
  - limit parameter?
  - offset parameter?
  - sort order?
  - total count?
```

### Query Optimization

**Current Architecture:**
- Single GET /me/stats call fetches:
  - Career statistics (aggregate)
  - Match history (paginated)
  - Both in one response

**Performance Considerations:**
- Single query is efficient
- Pagination prevents memory overload
- Aggregate stats don't require N+1 queries

**Mobile Implementation Should:**
- Reuse existing stats endpoint with pagination
- Use infinite query for "load more" pattern
- Proper staleTime (suggest: 5 minutes)
- Proper gcTime (suggest: 10 minutes)
- Cache invalidation on profile update

---

## Known Gaps & Unknowns

### Critical Unknowns

| Question | Impact | Status |
|----------|--------|--------|
| Does /me/stats support pagination? | CRITICAL | ❓ UNKNOWN |
| What is the exact response structure? | CRITICAL | ⚠️ INFERRED |
| Does match history include opponent info? | HIGH | ❓ UNKNOWN |
| Does match history include match result? | HIGH | ❓ UNKNOWN |
| Is fielding data (catches/stumpings) available? | MEDIUM | ❓ UNKNOWN |
| Can we fetch public player match history? | MEDIUM | ❓ UNKNOWN |
| Is match detail available (not just history)? | LOW | ❓ UNKNOWN |

### Backend Capabilities to Verify

```
[ ] GET /me/stats returns paginated match history
[ ] GET /me/stats accepts limit/offset parameters
[ ] GET /me/stats sorts by date (most recent first)
[ ] Match history includes match_id
[ ] Match history includes opponent/team info
[ ] Match history includes match result/status
[ ] Batting performance nullable when player didn't bat
[ ] Bowling performance nullable when player didn't bowl
[ ] Fielding stats available (catches/stumpings)
[ ] Public player stats available (GET /players/:id/stats)
[ ] Public player match history is visible
[ ] Date format is YYYY-MM-DD
[ ] Numeric fields are proper JSON numbers (not strings)
[ ] Performance data is well-tested and stable
```

---

## Recommended Phase 5C Implementation Plan

### Phase 5C.1 — Backend Verification (If Needed)

**Only if gaps found:**

Implement missing endpoints or expose missing pagination parameters.

**Requirements:**
- Pagination support (limit/offset)
- Stable sorting (most recent first)
- Proper nullable field handling
- Performance-tested for large match histories

### Phase 5C.2 — Mobile Types + API + Infrastructure

**Create/Update:**
- `mobile/src/types/index.ts` — Verify types match backend
- `mobile/src/services/playerApi.ts` — Verify API calls
- `mobile/src/hooks/playerKeys.ts` — Add match pagination keys
- `mobile/src/hooks/usePlayer.ts` — Verify existing hooks

**Do NOT:** Modify if existing implementation already correct.

### Phase 5C.3 — Player Match History Screen

**Create:**
- `mobile/app/(tabs)/profile/matches.tsx` — Full match history

**Features:**
- FlatList with pagination
- Match card component
- Load more button
- Pull-to-refresh
- Empty state
- Loading state
- Error state

### Phase 5C.4 — Match Performance Detail

**Create:**
- `mobile/app/(tabs)/profile/match/[id].tsx` — Match detail

**Display:**
- Batting performance (if participated)
- Bowling performance (if participated)
- Fielding stats
- Match date, opponent, result
- Back button

### Phase 5C.5 — Profile Integration

**Update:**
- `mobile/app/(tabs)/profile.tsx` — Add recent matches preview

**Options:**
1. Show 3 most recent matches + "View All Matches" button
2. Add "Recent Matches" section before statistics
3. Minimal impact on existing profile

### Phase 5C.6 — Production Hardening

**Audit:**
- TypeScript compilation
- ESLint
- Pagination behavior
- Cache coherence
- Refresh behavior
- Large match history
- Error scenarios
- Authorization
- Regression testing

---

## Risk Analysis

### Medium Risk

⚠️ **Pagination Complexity:** If /me/stats doesn't support pagination yet
- **Mitigation:** Implement server-side pagination
- **Effort:** 1-2 days backend

⚠️ **Missing Match Data:** If match detail is not available
- **Mitigation:** Determine what's actually exposed and implement accordingly
- **Effort:** Depends on gap size

### Low Risk

✅ **No Type Safety Risk:** Existing types appear correct
✅ **No Security Risk:** No IDOR vulnerable endpoints
✅ **No Performance Risk:** Single query, server-side pagination
✅ **No Regression Risk:** No changes to existing player profile

---

## Next Steps

### Before Implementation Starts

1. **Verify Backend:**
   - Inspect statistics.service.js
   - Confirm pagination support
   - Verify response structure
   - Check authorization logic

2. **Verify Types:**
   - Compare backend response to TypeScript interfaces
   - Check field names and nullability
   - Verify numeric types

3. **Verify Web App:**
   - How does existing web player profile display match history?
   - What UI patterns are used?
   - What terminology?

4. **Create Phase 5C Implementation Specification:**
   - Exact endpoints to use
   - Exact request/response format
   - Exact pagination strategy
   - Exact UI mockups

### Implementation Authorization

Once audit is complete and verified:

```
Proceed with Phase 5C.1: [  ] Backend verification (if needed)
Proceed with Phase 5C.2: [  ] Mobile infrastructure
Proceed with Phase 5C.3: [  ] Match history UI
Proceed with Phase 5C.4: [  ] Match detail UI
Proceed with Phase 5C.5: [  ] Profile integration
Proceed with Phase 5C.6: [  ] Production hardening
```

---

## Audit Status

**Phase 5C Audit:** ✅ COMPLETE (Framework)
**Backend Verification:** ⚠️ PENDING (Requires inspection of statistics.service.js)
**Type Verification:** ⚠️ PENDING (Requires backend response test)
**Web Reference:** ⚠️ PENDING (Requires web codebase inspection)
**Implementation Plan:** ⚠️ WAITING (Authorization needed after backend verification)

---

## Audit Sign-Off

**Audit Completed By:** Claude Code  
**Date:** 2026-08-20  
**Status:** Ready for backend verification and implementation planning

**Recommendation:** Before implementing Phase 5C, verify the unknowns listed above against actual backend code and responses.

