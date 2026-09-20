export interface User {
  id: number
  name: string
  email: string
  phone?: string
  role: 'user' | 'player' | 'staff' | 'ground_owner' | 'super_admin'
  // Only meaningful when role === 'staff'. Resolved from staff_roles.name on
  // /auth/me; Super Admin === role 'staff' + staff_role 'super_admin'.
  staff_role?: 'super_admin' | 'admin' | 'canteen_staff' | null
  // Only meaningful when role === 'player'. An Umpire is role 'player' +
  // player_type 'umpire' + an approved umpire_requests row.
  player_type?: 'team_player' | 'umpire' | null
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
  force_password_change?: boolean
  created_at: string
}

export type UmpireRequestStatus = 'pending' | 'approved' | 'rejected'

export interface UmpireRequest {
  id: number
  user_id: number
  status: UmpireRequestStatus
  requested_at: string
  decided_at: string | null
  decided_by: number | null
}

// Resolved client-side after auth. 'none' = umpire account with no request
// row; 'unknown' = the status request itself failed (retryable).
export type UmpireApproval = UmpireRequestStatus | 'none' | 'unknown' | null

export interface Player {
  id: number
  user_id: number
  name: string
  public_player_id: string
  role?: string | null
  batting_style?: string | null
  bowling_style?: string | null
  jersey_number?: number | null
  photo_url?: string | null
  city?: string | null
  bio?: string | null
  nickname?: string | null
  date_of_birth?: string | null
  is_wicket_keeper?: boolean
  address_line?: string | null
  state?: string | null
  postal_code?: string | null
  profile_onboarding_completed: boolean
  created_at: string
  updated_at?: string
  team_id?: number | null
}

// GET /players/:publicPlayerId response (statistics.service.js#getPublicPlayerProfile).
// A deliberately NARROW, public-safe DTO — NOT the same shape as `Player`
// (GET /me/player does `SELECT *` on the players row; this endpoint's own
// repository query, findPublicPlayerByPublicId, explicitly selects only
// these columns — no email/phone/user_id/date_of_birth/address_line/state/
// postal_code/is_wicket_keeper). Also camelCase throughout, unlike `Player`'s
// snake_case — a real, previously-uncaught mismatch: this used to be cast to
// `Player` and read via `.photo_url`/`.batting_style` etc., which were
// always undefined at runtime since the real keys are `.photoUrl`/
// `.battingStyle`.
export interface PublicPlayerProfile {
  publicPlayerId: string
  name: string
  role: string | null
  battingStyle: string | null
  bowlingStyle: string | null
  jerseyNumber: number | null
  photoUrl: string | null
  city: string | null
  bio: string | null
  team: { id: number; name: string; shortName: string; logoUrl: string | null } | null
}

// Editable fields for PATCH /me/player
export interface EditablePlayerFields {
  name?: string
  jersey_number?: number | null
  role?: string | null
  batting_style?: string | null
  bowling_style?: string | null
  city?: string | null
  bio?: string | null
  photo_url?: string | null
  nickname?: string | null
  date_of_birth?: string | null
  is_wicket_keeper?: boolean
  address_line?: string | null
  state?: string | null
  postal_code?: string | null
  profile_onboarding_completed?: boolean
}

// Career batting statistics
export interface BattingStats {
  innings: number
  notOuts: number
  runs: number
  ballsFaced: number
  highestScore: { runs: number; notOut: boolean } | null
  average: number | null
  strikeRate: number | null
  fours: number
  sixes: number
  thirties: number
  fifties: number
  hundreds: number
  ducks: number
}

// Career bowling statistics
export interface BowlingStats {
  innings: number
  legalBalls: number
  runsConceded: number
  wickets: number
  maidens: number
  average: number | null
  economy: number | null
  strikeRate: number | null
  equivalentOvers: number
  bestBowling: { wickets: number; runs: number } | null
  threeWicketHauls: number
  fourWicketHauls: number
  fiveWicketHauls: number
}

// Fielding statistics
export interface FieldingStats {
  catches: number
  stumpings: number
  runOuts: number
}

// Career statistics aggregate
export interface CareerStats {
  matches: number
  batting: BattingStats
  bowling: BowlingStats
  fielding: FieldingStats
}

// Batting performance in a single match
export interface MatchBattingPerformance {
  didBat: boolean
  runs?: number
  balls?: number
  fours?: number
  sixes?: number
  notOut?: boolean
  strikeRate?: number | null
}

// Bowling performance in a single match
export interface MatchBowlingPerformance {
  didBowl: boolean
  legalBalls?: number
  runs?: number
  wickets?: number
  maidens?: number
  ballsPerOver?: number
  economy?: number | null
}

// Performance in a single match
export interface PlayerMatchPerformance {
  matchId: number
  date: string
  venue: string | null
  // Immutable per-match team snapshot (match_players.team_id). Optional here
  // because a few lighter payloads reuse this shape.
  teamId?: number | null
  opponent: string
  result: string
  won: boolean | null
  batting: MatchBattingPerformance
  bowling: MatchBowlingPerformance
}

// Match history response
export interface MatchHistory {
  total: number
  limit: number
  offset: number
  items: PlayerMatchPerformance[]
}

// Personal bests
export interface PersonalBests {
  highestScore: { runs: number; notOut: boolean } | null
  bestBowling: { wickets: number; runs: number } | null
}

// Player minimal info for stats context
export interface PlayerMinimal {
  id: number
  publicPlayerId: string
  name: string
  role: string | null
}

// One team this player has genuinely represented in finalized matches —
// derived server-side from match_players.team_id (an immutable per-match
// snapshot), NOT a membership table (none exists). See
// statistics.service.js#buildTeamHistory. A player who has only ever played
// for their current team will simply have exactly one entry here; this is
// independent of players.team_id (the current-roster FK My Teams already
// uses) and reflects real historical participation, not fabricated data.
export interface TeamHistoryEntry {
  teamId: number
  name: string
  shortName: string
  logoUrl: string | null
  record: {
    matches: number
    wins: number
    losses: number
    ties: number
    noResults: number
    winPercentage: number | null
  }
  firstMatchDate: string
  lastMatchDate: string
}

// Career milestone (server/src/domain/statistics/careerMilestones.js).
// Deterministic threshold over finalized-match history; `achievedOn` is only
// present when the exact crossing match is known (never a fabricated date).
export interface CareerAchievement {
  id: string
  category: 'appearance' | 'batting' | 'bowling' | 'fielding'
  title: string
  description: string
  value: number
  target: number
  achieved: boolean
  achievedOn: { matchId: number; date: string; opponent: string } | null
}

export interface PlayerAchievements {
  earned: CareerAchievement[]
  next: CareerAchievement | null
}

// One calendar year of the player's career (server/src/domain/statistics/
// careerTimeline.js). Teams come from the real per-match team snapshot.
export interface CareerTimelineYear {
  year: number
  matches: number
  runs: number
  wickets: number
  teams: { teamId: number; name: string | null; shortName: string | null; logoUrl: string | null; matches: number }[]
  milestones: { id: string; title: string; matchId: number; opponent: string }[]
}

// Complete player statistics response (GET /me/stats or GET /players/:id/stats)
export interface PlayerStats {
  player: PlayerMinimal
  career: CareerStats
  recentForm: PlayerMatchPerformance[]
  matchHistory: MatchHistory
  personalBests: PersonalBests
  teamHistory: TeamHistoryEntry[]
  achievements: PlayerAchievements
  careerTimeline: CareerTimelineYear[]
}

export interface Team {
  id: number
  name: string
  short_name: string
  logo_url?: string
  owner_id?: number
  created_at: string
}

// Ground Owner — one ground the authenticated user actively owns
// (GET /ground-owner/grounds, normalized to camelCase in groundOwnerApi).
// GROUND_OWNER is a `ground_users` membership, never a `users.role` value,
// so ownership is derived from this list being non-empty, not from `User`.
export interface OwnedGround {
  id: number
  publicGroundId: string
  name: string
  city: string | null
  state: string | null
  status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED'
  upcomingMatchesCount: number
  umpireSlotsTotal: number
  umpireSlotsFilled: number
}

// GET /ground-owner/grounds/:publicGroundId/dashboard — Phase 0 reads only
// the high-level shape; later phases consume the full payload.
export interface GroundOwnerDashboard {
  date: string
  groundStatus: 'MATCH_DAY' | 'PARTIALLY_BLOCKED' | 'BOOKED' | 'OPEN'
  today: {
    bookingsCount: number
    blocksCount: number
    matchesCount: number
    availableSlotsCount: number
    blockedSlotsCount: number
  }
  upcoming7Days: {
    matches: unknown[]
    blocks: unknown[]
  }
  canteen: {
    ordersByStatus: Record<string, number>
    lowStockItems: { name: string; stock: number }[]
  }
}

// PATCH /ground-owner/grounds/:publicGroundId — only server-whitelisted
// fields. Omitted keys are left untouched; null clears an operating-hour
// override. Ownership/status/approval fields are never editable here.
export interface EditableGroundProfile {
  name?: string
  description?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
}

export interface EditableGroundLocation {
  addressLine?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  latitude?: number | null
  longitude?: number | null
  openingHour?: number | null
  closingHour?: number | null
}

// GET /ground-owner/grounds/:publicGroundId/media — owner-scoped rows
// (normalized to camelCase in groundOwnerApi).
export interface GroundMediaPhoto {
  id: number
  title: string | null
  imageUrl: string
  sortOrder: number
  isFeatured: boolean
}

// GET/POST/PATCH /ground-owner/grounds/:publicGroundId/pricing-slots.
// start/end are 'HH:MM' 24-hour ground-local time; overlap of active slots
// is rejected server-side.
export interface GroundPricingSlotDetail {
  id: number
  startTime: string
  endTime: string
  price: number
  isActive: boolean
}

// GET /ground-owner/grounds/:publicGroundId/bookings — serializeBooking()
// (camelCased server-side). Covers both CUSTOMER bookings and STAFF_BLOCK
// rows; `status` is CONFIRMED or CANCELLED (bookings auto-confirm — there is
// no pending/approval state).
export interface OwnerBooking {
  publicBookingId: string
  bookingType: 'CUSTOMER' | 'STAFF_BLOCK'
  blockType: string | null
  startTime: string
  endTime: string
  status: 'CONFIRMED' | 'CANCELLED'
  purpose: string | null
  expectedPlayers: number | null
  notes: string | null
  customerName: string | null
  contactPhone: string | null
  contactEmail: string | null
  createdAt: string
  cancelledAt: string | null
  checkedInAt: string | null
  noShowAt: string | null
}

export type OwnerBookingStatusFilter = 'ALL' | 'CONFIRMED' | 'CANCELLED'

export interface OwnerBookingFilters {
  fromDate: string | null
  toDate: string | null
  status: OwnerBookingStatusFilter
}

// GET /ground-owner/grounds/:publicGroundId/bookings/availability?date=
// Staff view — 2-hour grid slots from opening to closing, with the reason a
// slot is unavailable and the applicable hourly price (null = no price band).
export type OwnerSlotReason = 'PAST' | 'BOOKED' | 'BLOCKED' | 'MATCH' | null

export interface OwnerAvailabilitySlot {
  startTime: string
  endTime: string
  status: 'AVAILABLE' | 'UNAVAILABLE'
  reason: OwnerSlotReason
  price: number | null
}

export interface OwnerDayAvailability {
  date: string
  slots: OwnerAvailabilitySlot[]
}

export interface StaffBlockInput {
  date: string
  hour: number
  minute?: number
  purpose?: string
  blockType?: string | null
}

// --- Matches & umpire staffing (GET/POST /ground-owner/grounds/:id/matches*)

export type OwnerMatchStatus = 'upcoming' | 'live' | 'completed' | 'finalized' | 'cancelled'
export type OwnerUmpireSlotStatus = 'AVAILABLE' | 'ASSIGNED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
export type UmpirePaymentStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'FAILED' | 'CANCELLED'

// GET /ground-owner/grounds/:id/matches — findMatchesByGroundId row (snake
// case, normalized in groundOwnerApi). No name/title/type columns exist —
// a match is its two teams + date.
export interface OwnerMatchListItem {
  id: number
  matchDate: string
  venue: string | null
  status: OwnerMatchStatus
  requiredUmpires: number
  teamAName: string
  teamAShort: string | null
  teamBName: string
  teamBShort: string | null
  totalSlots: number
  filledSlots: number
  staffingForecast: StaffingForecast | null
}

// Backend's deterministic operational indicator (server/src/domain/
// umpireRecommendation/staffingForecast.js#computeStaffingForecast) — an
// object, never a plain string. See utils/ownerStatus.ts#staffingForecastMeta
// for the display label.
export interface StaffingForecast {
  status: string
  filledSlots: number
  totalSlots: number
  hoursUntilMatch: number | null
}

export interface CreateMatchInput {
  teamAId: number
  teamBId: number
  matchDate: string
  requiredUmpires?: number
  oversPerInnings?: number | null
  ballsPerOver?: number
}

export interface UmpireReputationSummary {
  userId: number
  name: string
  verified: boolean
  ratingAvg: number | null
  ratingCount: number
  reliability: number | null
  matchesOfficiated: number
  noShows: number
  cancellations: number
  experienceYears: number | null
  badges: string[]
}

export interface OwnerUmpireEarning {
  id: number
  amount: string | number
  currency: string
  status: UmpirePaymentStatus
}

export interface OwnerUmpireSlot {
  id: number
  slotNumber: number
  status: OwnerUmpireSlotStatus
  umpireUserId: number | null
  umpireName: string | null
  assignedAt: string | null
  cancelledAt: string | null
  cancellationReason: string | null
  completedAt: string | null
  reputation: UmpireReputationSummary | null
  earning: OwnerUmpireEarning | null
}

export interface OwnerUmpireFee {
  amount: string | number
  currency: string
}

export interface OwnerMatchProposal {
  id: number
  matchUmpireSlotId: number
  umpireUserId: number
  umpireName: string
  incentiveAmount: string | number
  currency: string
  message: string | null
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED'
  createdAt: string
  respondedAt: string | null
}

export interface OwnerRecommendedUmpire {
  id: number
  name: string
  reputation: UmpireReputationSummary | null
  hasEnoughData: boolean
  reasons: string[]
}

export interface OwnerReplacementCandidate {
  id: number
  name: string
  reputation: UmpireReputationSummary | null
}

export interface OwnerAssignmentEvent {
  id: number
  matchUmpireSlotId: number
  eventType: 'ASSIGNED' | 'CANCELLED' | 'NO_SHOW' | 'REPLACEMENT_ASSIGNED' | 'COMPLETED'
  recordedAt: string
  umpireUserId: number | null
  umpireName: string | null
}

export interface OwnerMatchIncident {
  id: number
  incidentType: string
  description: string | null
  occurredAt: string
}

export interface OwnerUmpireOpsSummary {
  matchesThisMonth: number
  fullyStaffed: number
  currentlyUnderstaffedUpcoming: number
  avgUmpireRating: number | null
  ratingSampleSize: number
  noShowCount: number
}

export interface TopUmpire {
  rank: number
  id: number
  name: string
  reputation: UmpireReputationSummary | null
  hasEnoughData: boolean
  reasons: string[]
}

// --- Ground Owner analytics / reviews / notifications
// (/ground-owner/grounds/:publicGroundId/analytics|reviews|notifications)

export type OwnerAnalyticsRange = 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS'

export interface OwnerAnalyticsUtilization {
  totalHours: number
  bookedHours: number
  blockedHours: number
  matchHours: number
  freeHours: number
  bookedPercentage: number | null
  blockedPercentage: number | null
  matchPercentage: number | null
  utilizedPercentage: number | null
}

export interface OwnerAnalytics {
  dateRange: string
  metrics: {
    totalBookings: number
    confirmedBookings: number
    cancelledBookings: number
    noShowBookings: number
    totalBookedHours: number
    averageBookingHours: number
  }
  breakdown: { confirmed: string; cancelled: string; noShow: string }
  utilization: OwnerAnalyticsUtilization
  canteenRevenue: { revenue: number; orderCount: number; averageOrderValue: number }
}

export interface OwnerTrendDay {
  date: string
  bookingCount: number
  canteenRevenue: number
  utilizedPercentage: number | null
}

export interface OwnerAnalyticsTrends {
  dateRange: string
  days: OwnerTrendDay[]
}

// Reviews are anonymous — no reviewer identity, no owner reply.
export interface OwnerReview {
  rating: number
  commentLiked: string | null
  commentImprove: string | null
  submittedAt: string
}

export interface OwnerReviewsResponse {
  reviews: OwnerReview[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

// Ground-scoped notifications (distinct from the generic /ground/notifications
// user inbox). related_* ids are INTERNAL integers, not public ids.
export interface OwnerGroundNotification {
  id: number
  type: string
  title: string
  body: string | null
  isRead: boolean
  createdAt: string
  relatedBookingId: number | null
  relatedMatchId: number | null
  relatedOrderId: number | null
}

export interface OwnerNotificationsResponse {
  notifications: OwnerGroundNotification[]
  total: number
  unreadCount: number
}

// --- Ground Owner staff (/ground-owner/grounds/:publicGroundId/staff*)
// Only GROUND_ADMIN / CANTEEN_STAFF are creatable. The list returns active
// memberships only — disabling a member removes them from it, and there is
// no re-enable endpoint. There is no staff-detail endpoint; detail is
// derived from the list by membershipId.

export type OwnerStaffRole = 'GROUND_ADMIN' | 'CANTEEN_STAFF'

export interface OwnerStaffMember {
  userId: number
  name: string
  email: string | null
  phone: string | null
  role: OwnerStaffRole
  membershipId: number
  createdAt: string
  permissions: string[]
}

// GET /ground-owner/permissions/catalog — flat list, no categories.
export interface OwnerPermission {
  key: string
  description: string
}

export interface CreateStaffInput {
  name: string
  identifier: string
  role: OwnerStaffRole
}

// --- Canteen management (/grounds/:publicGroundId/canteens/:publicCanteenId/*)
// Canteen identity comes from GET /grounds/:publicGroundId → `canteens`
// (see groundApi.GroundCanteen: { publicCanteenId, name, isActive }); there
// is no dedicated canteen list/detail endpoint.

// GET .../menu/master — ids are strings server-side; `stock` mirrors
// `defaultStock` (there is one stock value per master item).
export interface CanteenMenuItem {
  id: string
  name: string
  category: string
  description: string
  price: number
  image: string
  defaultStock: number
  stock: number
  isActive: boolean
}

export interface CanteenMenuItemInput {
  name: string
  category: string
  description?: string
  price: number
  stock?: number
  isActive?: boolean
  imageUri?: string | null
}

// GET .../menu/today/config — only the items configured for today.
export interface CanteenTodayMenuItem {
  id: string
  name: string
  category: string
  description: string
  price: number
  image: string
  defaultStock: number
  available: boolean
  stock: number
  dailyPrice: number
}

export interface CanteenTodayMenuConfig {
  publishedAt: string
  items: CanteenTodayMenuItem[]
}

// PATCH .../menu/today body — replaces the whole today set; ids that don't
// resolve to a master item are silently dropped server-side.
export interface CanteenTodayMenuEntryInput {
  id: string
  available: boolean
  stock: number
  dailyPrice: number
}

export type CanteenOrderStatus = 'Pending' | 'Accepted' | 'Preparing' | 'Ready' | 'Completed' | 'Cancelled'

export interface CanteenOrderItem {
  id: string | number
  foodId: string | number
  name: string
  price: number
  qty: number
}

export interface CanteenOrder {
  id: string
  userId: number
  customerName: string
  seatId: string | null
  items: CanteenOrderItem[]
  total: number
  status: CanteenOrderStatus
  orderedAt: string | null
  createdAt: string
  updatedAt: string | null
  completedAt: string | null
}

export interface CanteenOrdersPage {
  page: number
  limit: number
  total: number
  orders: CanteenOrder[]
}

export interface Ground {
  id: number
  name: string
  public_ground_id: string
  address_line?: string
  city?: string
  state?: string
  latitude?: number
  longitude?: number
  created_at: string
}

export type MatchStatus = 'upcoming' | 'live' | 'completed' | 'finalized' | 'cancelled'

// Lightweight team ref embedded in match payloads (buildMatchCard.js /
// matchSummary.service.js#teamSummary) — distinct from the full `Team`
// entity returned by /teams endpoints (different field set, snake_case).
export interface MatchTeamRef {
  id: number
  name: string
  shortName: string
  logoUrl: string | null
}

export interface MatchFormat {
  oversPerInnings: number | null
  ballsPerOver: number
}

// buildMatchCard.js's lightweight per-card innings entry.
export interface MatchCardInnings {
  inningsNumber: number
  battingTeamId: number
  runs: number
  wickets: number
  oversLabel: string
}

export interface MatchChase {
  target: number
  runsNeeded: number
  ballsRemaining: number | null
  requiredRunRate: number | null
}

export interface MatchResult {
  winnerTeamId: number | null
  resultType: string
  resultMargin: number | null
  text: string
}

// GET /matches/discover item shape (buildMatchCard.js) — also embedded in
// GET /matches/home's featuredLiveMatch/upcomingMatches/recentResults.
export interface Match {
  id: number
  status: MatchStatus
  isInningsBreak: boolean
  isOfficial: boolean
  awaitingFinalization: boolean
  matchDate: string
  venue: string | null
  format: MatchFormat
  teamA: MatchTeamRef
  teamB: MatchTeamRef
  innings: MatchCardInnings[]
  chase: MatchChase | null
  result: MatchResult | null
}

export interface MatchDiscoverResponse {
  category: 'LIVE' | 'UPCOMING' | 'RESULTS'
  pagination: {
    limit: number
    offset: number
    total: number
  }
  items: Match[]
}

export interface HomeFeedResponse {
  featuredLiveMatch: Match | null
  upcomingMatches: Match[]
  recentResults: Match[]
}

// GET /matches/:id/summary response (matchSummary.service.js)
export interface MatchSummaryInfo {
  id: number
  status: MatchStatus
  isInningsBreak: boolean
  isOfficial: boolean
  awaitingFinalization: boolean
  venue: string | null
  matchDate: string
  oversPerInnings: number | null
  ballsPerOver: number
}

export interface MatchToss {
  winnerTeamId: number
  decision: 'bat' | 'bowl'
  text: string
}

export interface MatchGround {
  name: string
  amenities: string[]
}

export interface InningsScore {
  runs: number
  wickets: number
  legalBalls: number
  oversLabel: string
  endReason: string | null
}

// Scorecard rows (server/src/domain/matchSummary/buildInningsSummary.js).
// `publicPlayerId` can be null (an "Unknown Player" fallback the server
// emits when a match_player row can't be resolved) — never navigate on null.
export interface ScorecardPlayerRef {
  publicPlayerId: string | null
  name: string
  teamId?: number | null
  isCaptain?: boolean
  isWicketkeeper?: boolean
}

export interface MatchBattingRow {
  player: ScorecardPlayerRef
  runs: number | null
  balls: number | null
  fours: number | null
  sixes: number | null
  strikeRate: number | null
  status: 'OUT' | 'NOT_OUT' | 'DNB' | 'YTB'
  dismissalText: string | null
}

export interface MatchBowlingRow {
  player: ScorecardPlayerRef
  oversLabel: string
  maidens: number
  runs: number
  wickets: number
  economy: number | null
  wides: number
  noBalls: number
}

export interface FallOfWicket {
  wicketNumber: number
  score: number
  overBall: string
  player: ScorecardPlayerRef
}

export interface InningsExtras {
  wides: number
  noBalls: number
  byes: number
  legByes: number
  total: number
}

export interface InningsTotal {
  runs: number
  wickets: number
  oversLabel: string
  runRate: number
}

// buildInningsSummary#buildPartnerships
export interface Partnership {
  batsmen: ScorecardPlayerRef[]
  runs: number
  balls: number
  endWicketNumber: number | null
  unbeaten: boolean
}

// buildInningsSummary#serializeDelivery
export interface OverDelivery {
  id: number
  over: number
  ball: number
  striker: ScorecardPlayerRef
  nonStriker: ScorecardPlayerRef
  bowler: ScorecardPlayerRef
  batRuns: number
  illegal: { type: string; runs: number } | null
  extra: { type: string; runs: number } | null
  totalRuns: number
  isLegalDelivery: boolean
  isFreeHit: boolean
  isDeadBall: boolean
  voided: boolean
  wicket: { type: string; player: ScorecardPlayerRef; dismissalText: string | null } | null
}

// buildInningsSummary#buildOvers
export interface MatchOver {
  over: number
  bowler: ScorecardPlayerRef
  runs: number
  wickets: number
  scoreAfter: string
  deliveries: OverDelivery[]
}

export interface MatchInningsDetail {
  inningsId: number
  inningsNumber: number
  status: string
  battingTeamId: number
  bowlingTeamId: number
  score: InningsScore
  target: number | null
  chase: MatchChase | null
  // Present on GET /matches/:id/summary (buildInningsSummary). Optional here
  // only because a few other code paths reuse this interface with the
  // lighter live-card shape.
  batting?: MatchBattingRow[]
  bowling?: MatchBowlingRow[]
  fallOfWickets?: FallOfWicket[]
  extras?: InningsExtras
  total?: InningsTotal
  partnerships?: Partnership[]
  overs?: MatchOver[]
}

export interface PlayingXiEntry {
  player: { publicPlayerId: string; name: string }
  isCaptain: boolean
  isWicketkeeper: boolean
}

export interface MatchSummary {
  match: MatchSummaryInfo
  teams: { teamA: MatchTeamRef; teamB: MatchTeamRef }
  toss: MatchToss | null
  result: MatchResult | null
  ground: MatchGround | null
  innings: MatchInningsDetail[]
  playingXi: { teamA: PlayingXiEntry[]; teamB: PlayingXiEntry[] }
  tournamentContext: unknown
}

export interface MatchLiveState {
  matchId: number
  status: 'upcoming' | 'live' | 'completed'
  teamA: {
    id: number
    name: string
    runs?: number
    wickets?: number
    overs?: number
  }
  teamB: {
    id: number
    name: string
    runs?: number
    wickets?: number
    overs?: number
  }
  currentBatter?: string
  currentBowler?: string
  recentDelivery?: string
}

export interface MfaStatus {
  enrolled: boolean
  required: boolean
  verified: boolean
}

export interface AuthResponse {
  user: User
  mfa?: MfaStatus
}

export interface AuthError {
  message: string
  code?: string
}

// Booking Types
export interface AvailableSlot {
  startTime: string  // ISO UTC
  endTime: string    // ISO UTC
  status: 'AVAILABLE' | 'UNAVAILABLE'
  reason?: string    // For staff: BOOKED, BLOCKED, MATCH, PAST
}

export interface Availability {
  date: string
  slots: AvailableSlot[]
}

export interface BookingRequest {
  startTime: string
  purpose?: string
  expectedPlayers?: number
  notes?: string
  contactPhone?: string
  contactEmail?: string
  clientActionId?: string
  publicGroundId?: string
}

export interface Booking {
  publicBookingId: string
  bookingType: string
  blockType?: string
  startTime: string
  endTime: string
  status: 'CONFIRMED' | 'CANCELLED'
  displayStatus: 'APPROVED' | 'COMPLETED' | 'CANCELLED'
  purpose?: string
  expectedPlayers?: number
  notes?: string
  // Server-computed, immutable price snapshot (₹). null only for a
  // STAFF_BLOCK — a CUSTOMER booking always carries one.
  amount?: number | null
  contactPhone?: string
  contactEmail?: string
  customerName: string
  createdAt: string
  cancelledAt?: string
  // Priority 4 — the ground this booking is for. Present on the
  // GET /bookings/my list (LEFT JOIN grounds); absent on create/cancel
  // responses, which select ground_bookings alone.
  ground?: { publicGroundId: string; name: string; city: string | null } | null
}

export interface Notification {
  id: number
  userId: number
  type: string
  title: string
  body?: string
  relatedBookingId?: number
  relatedMatchId?: number
  isRead: boolean
  createdAt: string
}

export interface NotificationsResponse {
  notifications: Notification[]
  total: number
  unreadCount: number
}

export interface MatchProposal {
  publicProposalId: string
  status: 'OPEN' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED'
  proposingTeamId: number
  acceptedByTeamId?: number
  proposalExpiresAt: string
  createdAt: string
  updatedAt: string
  publicBookingId?: string
  startTime?: string
  endTime?: string
  matchFormat?: string
  purpose?: string
  bookingStatus?: string
}

export interface MatchProposalsListResponse {
  proposals: MatchProposal[]
  total?: number
}

export interface SocketMatchStatePayload {
  matchId: number
  reason: string
  match: {
    id: number
    status: 'upcoming' | 'live' | 'completed'
    isLive: boolean
    isInningsBreak: boolean
    isCompleted: boolean
    isFinalized: boolean
  }
  result: {
    resultType: string
    resultMargin: number
    text: string
    winnerTeamId: number
  } | null
  target: number | null
  currentInnings: {
    id: number
    number: number
    version: number
    status: 'upcoming' | 'live' | 'completed'
    battingTeamId: number
    bowlingTeamId: number
    runs: number
    wickets: number
    legalBalls: number
    oversLabel: string
    currentRunRate: number | null
    chase: {
      runsNeeded: number
      ballsRemaining: number | null
      requiredRunRate: number | null
    } | null
    striker: {
      player: { publicPlayerId: string | null; name: string }
      runs: number
      balls: number
      fours: number
      sixes: number
      strikeRate: number | null
    } | null
    nonStriker: {
      player: { publicPlayerId: string | null; name: string }
      runs: number
      balls: number
      fours: number
      sixes: number
      strikeRate: number | null
    } | null
    bowler: {
      player: { publicPlayerId: string | null; name: string }
      oversLabel: string
      runs: number
      wickets: number
      economy: number | null
    } | null
    currentOver: {
      id: number
      over: number
      ball: number
      batRuns: number
      illegal: boolean
      extra: string | null
      totalRuns: number
      isLegalDelivery: boolean
      isFreeHit: boolean
      voided: boolean
      isDeadBall: boolean
      wicket: boolean
    }[]
    recentDeliveries: {
      id: number
      over: number
      ball: number
      batRuns: number
      illegal: boolean
      extra: string | null
      totalRuns: number
      isLegalDelivery: boolean
      isFreeHit: boolean
      voided: boolean
      isDeadBall: boolean
      wicket: boolean
    }[]
  } | null
}
