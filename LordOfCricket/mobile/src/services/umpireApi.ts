import api from './api'
import { UmpireRequest } from '../types'

// Umpire self-service client. Mirrors the website's umpireSelfApi.js /
// umpireApi.js contracts. Only the endpoints needed by the current
// workspace build are wrapped here; later phases extend this file.

export async function getMyUmpireRequest(): Promise<UmpireRequest | null> {
  const { data } = await api.get<{ request: UmpireRequest | null }>('/umpire-requests/me')
  return data.request
}

export interface UmpireProfile {
  user_id: number
  bio: string | null
  is_available: boolean
  matches_officiated: number
  matches_cancelled: number
  matches_no_show: number
  rating_avg: number | null
  rating_count: number
  reliability: number | null
  verified: boolean
  experienceYears: number | null
  badges: string[]
  recentRatings: { rating: number; createdAt: string }[]
}

export async function getMyUmpireProfile(): Promise<UmpireProfile> {
  const { data } = await api.get<{ profile: UmpireProfile }>('/umpire/profile')
  return data.profile
}

export async function updateMyUmpireProfile(fields: {
  bio?: string
  isAvailable?: boolean
}): Promise<UmpireProfile> {
  const { data } = await api.patch<{ profile: UmpireProfile }>('/umpire/profile', fields)
  return data.profile
}

export interface WeeklyAvailabilityRule {
  day_of_week: number
  is_available: boolean
}

export interface DateAvailabilityOverride {
  specific_date: string
  start_time: string | null
  end_time: string | null
  is_available: boolean
}

export interface UmpireAvailability {
  weekly: WeeklyAvailabilityRule[]
  dateOverrides: DateAvailabilityOverride[]
}

export async function getMyAvailability(): Promise<UmpireAvailability> {
  const { data } = await api.get<UmpireAvailability>('/umpire/availability')
  return { weekly: data.weekly ?? [], dateOverrides: data.dateOverrides ?? [] }
}

export async function setWeeklyAvailability(
  dayOfWeek: number,
  isAvailable: boolean,
): Promise<WeeklyAvailabilityRule> {
  const { data } = await api.patch<{ rule: WeeklyAvailabilityRule }>('/umpire/availability/weekly', {
    dayOfWeek,
    isAvailable,
  })
  return data.rule
}

export async function setDateAvailability(payload: {
  date: string
  isAvailable: boolean
  startTime?: string | null
  endTime?: string | null
}): Promise<DateAvailabilityOverride> {
  const { data } = await api.patch<{ override: DateAvailabilityOverride }>('/umpire/availability/date', payload)
  return data.override
}

export async function deleteDateAvailability(date: string): Promise<void> {
  await api.delete(`/umpire/availability/date/${date}`)
}

export interface UmpireAssignment {
  id: number
  slot_number: number
  status: 'AVAILABLE' | 'ASSIGNED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
  assigned_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  match_id: number
  match_date: string
  venue: string | null
  match_status: string
  team_a_name: string
  team_a_short: string
  team_b_name: string
  team_b_short: string
  ground_name: string | null
  ground_city: string | null
}

export async function getMyAssignments(): Promise<UmpireAssignment[]> {
  const { data } = await api.get<{ assignments: UmpireAssignment[] }>('/umpire/assignments')
  return data.assignments ?? []
}

// --- Match discovery -------------------------------------------------------

export interface AvailableMatch {
  id: number
  match_date: string
  venue: string | null
  status: string
  required_umpires: number
  team_a_name: string
  team_a_short: string
  team_b_name: string
  team_b_short: string
  ground_name: string | null
  ground_city: string | null
  total_slots: number
  filled_slots: number
}

export async function getAvailableMatches(): Promise<AvailableMatch[]> {
  const { data } = await api.get<{ matches: AvailableMatch[] }>('/umpire/matches/available')
  return data.matches ?? []
}

export interface UmpireSlot {
  id: number
  match_id: number
  slot_number: number
  status: 'AVAILABLE' | 'ASSIGNED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
  umpire_user_id: number | null
  umpire_name: string | null
  assigned_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
}

export async function getMatchUmpireSlots(matchId: number): Promise<UmpireSlot[]> {
  const { data } = await api.get<{ slots: UmpireSlot[] }>(`/matches/${matchId}/umpire-slots`)
  return data.slots ?? []
}

export async function applyForMatchSlot(matchId: number): Promise<UmpireSlot> {
  const { data } = await api.post<{ slot: UmpireSlot }>(`/matches/${matchId}/umpire-slots/apply`)
  return data.slot
}

export async function cancelMatchSlot(matchId: number): Promise<UmpireSlot> {
  const { data } = await api.post<{ slot: UmpireSlot }>(`/matches/${matchId}/umpire-slots/cancel`)
  return data.slot
}

// --- Ground discovery ----------------------------------------------------

export interface GroundMatchRow {
  matchId: number
  matchDate: string
  venue: string | null
  teamAName: string
  teamAShort: string
  teamBName: string
  teamBShort: string
  requiredUmpires: number
  oversPerInnings: number | null
  ballsPerOver: number | null
  totalSlots: number
  filledSlots: number
  currentUserAssigned: boolean
  hasScheduleConflict: boolean
}

export interface UmpireGround {
  publicGroundId: string
  slug: string | null
  name: string
  city: string | null
  state: string | null
  country: string | null
  photos: string[]
  amenities: string[]
  distanceKm?: number
  matches: GroundMatchRow[]
}

export interface UmpireGroundsResponse {
  grounds: UmpireGround[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
  anyGroundsExist: boolean
}

export async function getUmpireGroundsAll(page = 1, limit = 20): Promise<UmpireGroundsResponse> {
  const { data } = await api.get<UmpireGroundsResponse>('/umpire/grounds/all', { params: { page, limit } })
  return data
}

export async function getUmpireGroundsByCity(city: string, page = 1, limit = 20): Promise<UmpireGroundsResponse> {
  const { data } = await api.get<UmpireGroundsResponse>('/umpire/grounds/by-city', { params: { city, page, limit } })
  return data
}

// --- Earnings -----------------------------------------------------------

export interface EarningRow {
  id: number
  matchId: number
  groundName: string | null
  teamAName: string
  teamBName: string
  matchDate: string
  amount: number
  currency: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface UmpireEarnings {
  summary: { thisMonth: number; pending: number; paid: number; hasAnyData: boolean }
  recent: EarningRow[]
}

export async function getMyEarnings(): Promise<UmpireEarnings> {
  const { data } = await api.get<UmpireEarnings>('/umpire/earnings')
  return data
}

// --- Officiating trend -------------------------------------------------

export interface TrendMonth {
  month: string
  matchesOfficiated: number
  reliability: number | null
  ratingAvg: number | null
}

export async function getMyOfficiatingTrend(months = 6): Promise<TrendMonth[]> {
  const { data } = await api.get<{ months: TrendMonth[] }>('/umpire/statistics/trend', { params: { months } })
  return data.months ?? []
}

// --- Proposals -------------------------------------------------------

export interface UmpireProposal {
  id: number
  match_id: number
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED'
  incentive_amount: number
  currency: string
  message: string | null
  created_at: string
  responded_at: string | null
  match_date: string
  match_status: string
  team_a_name: string
  team_b_name: string
  ground_name: string | null
  ground_city: string | null
  proposed_by_name: string | null
}

export async function getMyProposals(): Promise<UmpireProposal[]> {
  const { data } = await api.get<{ proposals: UmpireProposal[] }>('/umpire/proposals')
  return data.proposals ?? []
}

export async function respondToProposal(proposalId: number, accept: boolean): Promise<void> {
  await api.post(`/umpire/proposals/${proposalId}/respond`, { accept })
}
