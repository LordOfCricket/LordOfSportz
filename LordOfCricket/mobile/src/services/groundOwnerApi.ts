import api from './api'
import type { GroundAmenity, GroundCanteen } from './groundApi'
import {
  CanteenMenuItem,
  CanteenMenuItemInput,
  CanteenOrder,
  CanteenOrdersPage,
  CanteenOrderStatus,
  CanteenTodayMenuConfig,
  CanteenTodayMenuEntryInput,
  CreateMatchInput,
  EditableGroundLocation,
  EditableGroundProfile,
  GroundMediaPhoto,
  GroundOwnerDashboard,
  GroundPricingSlotDetail,
  OwnedGround,
  OwnerAssignmentEvent,
  OwnerBooking,
  OwnerBookingFilters,
  OwnerDayAvailability,
  OwnerMatchIncident,
  OwnerMatchListItem,
  OwnerMatchProposal,
  OwnerRecommendedUmpire,
  OwnerReplacementCandidate,
  OwnerAnalytics,
  OwnerAnalyticsRange,
  OwnerAnalyticsTrends,
  OwnerGroundNotification,
  OwnerNotificationsResponse,
  OwnerPermission,
  OwnerReviewsResponse,
  OwnerStaffMember,
  OwnerUmpireFee,
  OwnerUmpireOpsSummary,
  OwnerUmpireSlot,
  CreateStaffInput,
  StaffBlockInput,
  UmpirePaymentStatus,
} from '../types'

// Ground Owner self-service client. Mirrors the website's groundOwnerApi.js
// contract; only the endpoints Phase 0 needs are wrapped here, later phases
// extend this file. Every request rides the shared authenticated session
// (src/services/api.ts) — authorization is enforced server-side by
// requireGroundRole('GROUND_OWNER') on each route.

// GET /ground-owner/grounds returns `grounds: (grounds row + aggregate)[]`
// with the raw table columns in snake_case; normalize to the app's camelCase
// convention (same approach as groundApi.ts / notificationApi.ts).
function normalizeOwnedGround(row: any): OwnedGround {
  return {
    id: row.id,
    publicGroundId: row.public_ground_id ?? row.publicGroundId,
    name: row.name,
    city: row.city ?? null,
    state: row.state ?? null,
    status: row.status,
    upcomingMatchesCount: row.upcomingMatchesCount ?? 0,
    umpireSlotsTotal: row.umpireSlotsTotal ?? 0,
    umpireSlotsFilled: row.umpireSlotsFilled ?? 0,
  }
}

export async function fetchMyGrounds(): Promise<OwnedGround[]> {
  const { data } = await api.get<{ grounds: any[] }>('/ground-owner/grounds')
  return (data.grounds ?? []).map(normalizeOwnedGround)
}

export async function fetchGroundDashboard(publicGroundId: string): Promise<GroundOwnerDashboard> {
  const { data } = await api.get<GroundOwnerDashboard>(
    `/ground-owner/grounds/${publicGroundId}/dashboard`,
  )
  return data
}

// PATCH /ground-owner/grounds/:publicGroundId — shared by the Profile and
// Location/Hours screens; each sends only the fields it owns. Response is
// the updated ground (camelCase); callers refetch the public ground detail
// query rather than consuming it directly.
export async function updateGroundProfile(
  publicGroundId: string,
  updates: EditableGroundProfile | EditableGroundLocation,
): Promise<void> {
  await api.patch(`/ground-owner/grounds/${publicGroundId}`, updates)
}

// --- Media ---------------------------------------------------------------

function normalizeMediaPhoto(row: any): GroundMediaPhoto {
  return {
    id: row.id,
    title: row.title ?? null,
    imageUrl: row.image_url ?? row.imageUrl,
    sortOrder: row.sort_order ?? row.sortOrder ?? 0,
    isFeatured: row.is_featured ?? row.isFeatured ?? false,
  }
}

export async function fetchGroundMedia(publicGroundId: string): Promise<GroundMediaPhoto[]> {
  const { data } = await api.get<{ photos: any[] }>(`/ground-owner/grounds/${publicGroundId}/media`)
  return (data.photos ?? []).map(normalizeMediaPhoto)
}

// Backend expects multipart form-data with a `photo` file field (same
// convention as playerApi.uploadPlayerPhoto); JPEG/PNG/WEBP, max 10MB.
export async function uploadGroundMedia(publicGroundId: string, file: Blob): Promise<GroundMediaPhoto> {
  const formData = new FormData()
  formData.append('photo', file)
  const { data } = await api.post<{ photo: any }>(
    `/ground-owner/grounds/${publicGroundId}/media/upload`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return normalizeMediaPhoto(data.photo)
}

export async function setGroundHeroPhoto(publicGroundId: string, photoId: number): Promise<void> {
  await api.patch(`/ground-owner/grounds/${publicGroundId}/media/${photoId}/hero`)
}

export async function deleteGroundMedia(publicGroundId: string, photoId: number): Promise<void> {
  await api.delete(`/ground-owner/grounds/${publicGroundId}/media/${photoId}`)
}

export async function reorderGroundMedia(
  publicGroundId: string,
  updates: { id: number; sortOrder: number }[],
): Promise<GroundMediaPhoto[]> {
  const { data } = await api.patch<{ photos: any[] }>(
    `/ground-owner/grounds/${publicGroundId}/media/reorder`,
    { updates },
  )
  return (data.photos ?? []).map(normalizeMediaPhoto)
}

// --- Amenities ---------------------------------------------------------

export async function fetchGroundAmenities(publicGroundId: string): Promise<GroundAmenity[]> {
  const { data } = await api.get<{ amenities: GroundAmenity[] }>(
    `/ground-owner/grounds/${publicGroundId}/amenities`,
  )
  return data.amenities ?? []
}

export async function fetchAmenityCatalog(): Promise<GroundAmenity[]> {
  const { data } = await api.get<{ amenities: GroundAmenity[] }>('/ground-owner-requests/amenity-catalog')
  return data.amenities ?? []
}

export async function addGroundAmenity(publicGroundId: string, amenityKey: string): Promise<GroundAmenity[]> {
  const { data } = await api.post<{ amenities: GroundAmenity[] }>(
    `/ground-owner/grounds/${publicGroundId}/amenities`,
    { amenityKey },
  )
  return data.amenities ?? []
}

export async function removeGroundAmenity(publicGroundId: string, amenityKey: string): Promise<GroundAmenity[]> {
  const { data } = await api.delete<{ amenities: GroundAmenity[] }>(
    `/ground-owner/grounds/${publicGroundId}/amenities/${amenityKey}`,
  )
  return data.amenities ?? []
}

// --- Pricing slots ---------------------------------------------------

function normalizePricingSlot(row: any): GroundPricingSlotDetail {
  return {
    id: row.id,
    startTime: String(row.start_time ?? row.startTime).slice(0, 5),
    endTime: String(row.end_time ?? row.endTime).slice(0, 5),
    price: Number(row.price),
    isActive: row.is_active ?? row.isActive ?? true,
  }
}

export async function fetchGroundPricingSlots(publicGroundId: string): Promise<GroundPricingSlotDetail[]> {
  const { data } = await api.get<{ slots: any[] }>(`/ground-owner/grounds/${publicGroundId}/pricing-slots`)
  return (data.slots ?? []).map(normalizePricingSlot)
}

export interface PricingSlotInput {
  startTime: string
  endTime: string
  price: number
}

export async function createGroundPricingSlot(
  publicGroundId: string,
  input: PricingSlotInput,
): Promise<GroundPricingSlotDetail> {
  const { data } = await api.post<{ slot: any }>(
    `/ground-owner/grounds/${publicGroundId}/pricing-slots`,
    input,
  )
  return normalizePricingSlot(data.slot)
}

export async function updateGroundPricingSlot(
  publicGroundId: string,
  slotId: number,
  input: Partial<PricingSlotInput> & { isActive?: boolean },
): Promise<GroundPricingSlotDetail> {
  const { data } = await api.patch<{ slot: any }>(
    `/ground-owner/grounds/${publicGroundId}/pricing-slots/${slotId}`,
    input,
  )
  return normalizePricingSlot(data.slot)
}

export async function deleteGroundPricingSlot(publicGroundId: string, slotId: number): Promise<void> {
  await api.delete(`/ground-owner/grounds/${publicGroundId}/pricing-slots/${slotId}`)
}

// --- Bookings ------------------------------------------------------------

function normalizeBooking(row: any): OwnerBooking {
  return {
    publicBookingId: row.publicBookingId ?? row.public_booking_id,
    bookingType: row.bookingType ?? row.booking_type,
    blockType: row.blockType ?? row.block_type ?? null,
    startTime: row.startTime ?? row.start_time,
    endTime: row.endTime ?? row.end_time,
    status: row.status,
    purpose: row.purpose ?? null,
    expectedPlayers: row.expectedPlayers ?? row.expected_players ?? null,
    notes: row.notes ?? null,
    customerName: row.customerName ?? row.customer_name ?? null,
    contactPhone: row.contactPhone ?? row.contact_phone ?? null,
    contactEmail: row.contactEmail ?? row.contact_email ?? null,
    createdAt: row.createdAt ?? row.created_at,
    cancelledAt: row.cancelledAt ?? row.cancelled_at ?? null,
    checkedInAt: row.checkedInAt ?? row.checked_in_at ?? null,
    noShowAt: row.noShowAt ?? row.no_show_at ?? null,
  }
}

export async function fetchGroundBookings(
  publicGroundId: string,
  filters: Partial<Pick<OwnerBookingFilters, 'fromDate' | 'toDate'>> & { status?: 'CONFIRMED' | 'CANCELLED' } = {},
): Promise<OwnerBooking[]> {
  const params: Record<string, string> = {}
  if (filters.fromDate) params.fromDate = filters.fromDate
  if (filters.toDate) params.toDate = filters.toDate
  if (filters.status) params.status = filters.status
  const { data } = await api.get<{ bookings: any[] }>(`/ground-owner/grounds/${publicGroundId}/bookings`, { params })
  return (data.bookings ?? []).map(normalizeBooking)
}

export async function fetchGroundBooking(publicGroundId: string, publicBookingId: string): Promise<OwnerBooking> {
  const { data } = await api.get<{ booking: any }>(
    `/ground-owner/grounds/${publicGroundId}/bookings/${publicBookingId}`,
  )
  return normalizeBooking(data.booking)
}

export async function fetchGroundBookingAvailability(
  publicGroundId: string,
  date: string,
): Promise<OwnerDayAvailability> {
  const { data } = await api.get<OwnerDayAvailability>(
    `/ground-owner/grounds/${publicGroundId}/bookings/availability`,
    { params: { date } },
  )
  return data
}

export async function createGroundStaffBlock(publicGroundId: string, input: StaffBlockInput): Promise<OwnerBooking> {
  const { data } = await api.post<{ booking: any }>(
    `/ground-owner/grounds/${publicGroundId}/bookings/staff-blocks`,
    input,
  )
  return normalizeBooking(data.booking)
}

// The backend PATCH .../status route only cancels a STAFF_BLOCK — identical
// effect to this DELETE. Customer-booking check-in / no-show / cancel are
// not exposed on any owner route.
export async function deleteGroundStaffBlock(publicGroundId: string, publicBlockId: string): Promise<void> {
  await api.delete(`/ground-owner/grounds/${publicGroundId}/bookings/staff-blocks/${publicBlockId}`)
}

// --- Matches ----------------------------------------------------------

function normalizeMatch(row: any): OwnerMatchListItem {
  return {
    id: row.id,
    matchDate: row.match_date ?? row.matchDate,
    venue: row.venue ?? null,
    status: row.status,
    requiredUmpires: row.required_umpires ?? row.requiredUmpires ?? 0,
    teamAName: row.team_a_name ?? row.teamAName ?? '',
    teamAShort: row.team_a_short ?? row.teamAShort ?? null,
    teamBName: row.team_b_name ?? row.teamBName ?? '',
    teamBShort: row.team_b_short ?? row.teamBShort ?? null,
    totalSlots: row.total_slots ?? row.totalSlots ?? 0,
    filledSlots: row.filled_slots ?? row.filledSlots ?? 0,
    staffingForecast: row.staffingForecast ?? null,
  }
}

export async function fetchGroundMatches(publicGroundId: string): Promise<OwnerMatchListItem[]> {
  const { data } = await api.get<{ matches: any[] }>(`/ground-owner/grounds/${publicGroundId}/matches`)
  return (data.matches ?? []).map(normalizeMatch)
}

export async function createGroundMatch(publicGroundId: string, input: CreateMatchInput): Promise<{ id: number }> {
  const { data } = await api.post<{ match: any }>(`/ground-owner/grounds/${publicGroundId}/matches`, input)
  return { id: data.match?.id }
}

export async function startGroundMatch(
  publicGroundId: string,
  matchId: number,
  confirmUnderstaffed = false,
): Promise<void> {
  await api.post(`/ground-owner/grounds/${publicGroundId}/matches/${matchId}/start`, { confirmUnderstaffed })
}

export async function completeGroundMatch(publicGroundId: string, matchId: number): Promise<void> {
  await api.post(`/ground-owner/grounds/${publicGroundId}/matches/${matchId}/complete`)
}

export async function cancelGroundMatch(publicGroundId: string, matchId: number, reason?: string): Promise<void> {
  await api.post(`/ground-owner/grounds/${publicGroundId}/matches/${matchId}/cancel`, { reason })
}

// --- Umpire staffing -------------------------------------------------

function normalizeSlot(row: any): OwnerUmpireSlot {
  return {
    id: row.id,
    slotNumber: row.slot_number ?? row.slotNumber,
    status: row.status,
    umpireUserId: row.umpire_user_id ?? row.umpireUserId ?? null,
    umpireName: row.umpire_name ?? row.umpireName ?? null,
    assignedAt: row.assigned_at ?? row.assignedAt ?? null,
    cancelledAt: row.cancelled_at ?? row.cancelledAt ?? null,
    cancellationReason: row.cancellation_reason ?? row.cancellationReason ?? null,
    completedAt: row.completed_at ?? row.completedAt ?? null,
    reputation: row.reputation ?? null,
    earning: row.earning ?? null,
  }
}

export async function fetchGroundMatchUmpireSlots(
  publicGroundId: string,
  matchId: number,
): Promise<{ umpireFee: OwnerUmpireFee | null; slots: OwnerUmpireSlot[] }> {
  const { data } = await api.get<{ umpireFee: OwnerUmpireFee | null; slots: any[] }>(
    `/ground-owner/grounds/${publicGroundId}/matches/${matchId}/umpire-slots`,
  )
  return { umpireFee: data.umpireFee ?? null, slots: (data.slots ?? []).map(normalizeSlot) }
}

export async function setGroundMatchUmpireFee(
  publicGroundId: string,
  matchId: number,
  amount: number,
  currency = 'INR',
): Promise<void> {
  await api.patch(`/ground-owner/grounds/${publicGroundId}/matches/${matchId}/umpire-fee`, { amount, currency })
}

export async function updateGroundMatchSlotPaymentStatus(
  publicGroundId: string,
  matchId: number,
  slotId: number,
  status: UmpirePaymentStatus,
): Promise<void> {
  await api.patch(
    `/ground-owner/grounds/${publicGroundId}/matches/${matchId}/umpire-slots/${slotId}/payment-status`,
    { status },
  )
}

export async function markGroundMatchUmpireNoShow(
  publicGroundId: string,
  matchId: number,
  slotId: number,
): Promise<void> {
  await api.post(`/ground-owner/grounds/${publicGroundId}/matches/${matchId}/umpire-slots/${slotId}/no-show`)
}

export async function fetchEligibleReplacements(
  publicGroundId: string,
  matchId: number,
  slotId: number,
): Promise<OwnerReplacementCandidate[]> {
  const { data } = await api.get<{ candidates: OwnerReplacementCandidate[] }>(
    `/ground-owner/grounds/${publicGroundId}/matches/${matchId}/umpire-slots/${slotId}/eligible-replacements`,
  )
  return data.candidates ?? []
}

export async function assignGroundMatchReplacement(
  publicGroundId: string,
  matchId: number,
  slotId: number,
  newUmpireUserId: number,
): Promise<void> {
  await api.post(`/ground-owner/grounds/${publicGroundId}/matches/${matchId}/umpire-slots/${slotId}/replace`, {
    newUmpireUserId,
  })
}

export async function fetchGroundMatchAssignmentHistory(
  publicGroundId: string,
  matchId: number,
): Promise<OwnerAssignmentEvent[]> {
  const { data } = await api.get<{ events: any[] }>(
    `/ground-owner/grounds/${publicGroundId}/matches/${matchId}/umpire-history`,
  )
  return (data.events ?? []).map((e) => ({
    id: e.id,
    matchUmpireSlotId: e.match_umpire_slot_id ?? e.matchUmpireSlotId,
    eventType: e.event_type ?? e.eventType,
    recordedAt: e.recorded_at ?? e.recordedAt,
    umpireUserId: e.umpire_user_id ?? e.umpireUserId ?? null,
    umpireName: e.umpire_name ?? e.umpireName ?? null,
  }))
}

export async function fetchGroundMatchRecommendedUmpires(
  publicGroundId: string,
  matchId: number,
  limit = 8,
): Promise<OwnerRecommendedUmpire[]> {
  const { data } = await api.get<{ candidates: OwnerRecommendedUmpire[] }>(
    `/ground-owner/grounds/${publicGroundId}/matches/${matchId}/recommended-umpires`,
    { params: { limit } },
  )
  return data.candidates ?? []
}

export async function fetchGroundMatchIncidents(
  publicGroundId: string,
  matchId: number,
): Promise<OwnerMatchIncident[]> {
  const { data } = await api.get<{ incidents: any[] }>(
    `/ground-owner/grounds/${publicGroundId}/matches/${matchId}/incidents`,
  )
  return (data.incidents ?? []).map((i) => ({
    id: i.id,
    incidentType: i.incident_type ?? i.incidentType,
    description: i.description ?? null,
    occurredAt: i.occurred_at ?? i.occurredAt,
  }))
}

export async function fetchGroundUmpireOperationsSummary(publicGroundId: string): Promise<OwnerUmpireOpsSummary> {
  const { data } = await api.get<{ summary: OwnerUmpireOpsSummary }>(
    `/ground-owner/grounds/${publicGroundId}/umpire-operations-summary`,
  )
  return data.summary
}

// --- Umpire proposals ----------------------------------------------

function normalizeProposal(row: any): OwnerMatchProposal {
  return {
    id: row.id,
    matchUmpireSlotId: row.match_umpire_slot_id ?? row.matchUmpireSlotId,
    umpireUserId: row.umpire_user_id ?? row.umpireUserId,
    umpireName: row.umpire_name ?? row.umpireName ?? '',
    incentiveAmount: row.incentive_amount ?? row.incentiveAmount ?? 0,
    currency: row.currency ?? 'INR',
    message: row.message ?? null,
    status: row.status,
    createdAt: row.created_at ?? row.createdAt,
    respondedAt: row.responded_at ?? row.respondedAt ?? null,
  }
}

export async function fetchGroundMatchProposals(
  publicGroundId: string,
  matchId: number,
): Promise<OwnerMatchProposal[]> {
  const { data } = await api.get<{ proposals: any[] }>(
    `/ground-owner/grounds/${publicGroundId}/matches/${matchId}/proposals`,
  )
  return (data.proposals ?? []).map(normalizeProposal)
}

export async function proposeGroundMatchUmpire(
  publicGroundId: string,
  matchId: number,
  slotId: number,
  body: { umpireUserId: number; incentiveAmount?: number; message?: string },
): Promise<void> {
  await api.post(
    `/ground-owner/grounds/${publicGroundId}/matches/${matchId}/umpire-slots/${slotId}/propose`,
    body,
  )
}

export async function cancelGroundMatchProposal(
  publicGroundId: string,
  matchId: number,
  proposalId: number,
): Promise<void> {
  await api.post(`/ground-owner/grounds/${publicGroundId}/matches/${matchId}/proposals/${proposalId}/cancel`)
}

// --- Canteen ----------------------------------------------------------
// Multi-ground canteen routes. Every path carries both public ids; the
// server verifies the canteen belongs to the ground and that the caller is
// a GROUND_OWNER of it. There is no canteen list/detail endpoint — the
// canteen list comes from GET /grounds/:publicGroundId (groundApi).

const canteenBase = (publicGroundId: string, publicCanteenId: string) =>
  `/grounds/${publicGroundId}/canteens/${publicCanteenId}`

function normalizeMenuItem(row: any): CanteenMenuItem {
  return {
    id: String(row.id),
    name: row.name,
    category: row.category ?? '',
    description: row.description ?? '',
    price: Number(row.price ?? 0),
    image: row.image ?? '',
    defaultStock: row.defaultStock ?? row.default_stock ?? 0,
    stock: row.stock ?? row.defaultStock ?? row.default_stock ?? 0,
    isActive: row.isActive ?? row.is_active ?? true,
  }
}

export async function fetchCanteenMenu(publicGroundId: string, publicCanteenId: string): Promise<CanteenMenuItem[]> {
  const { data } = await api.get<{ items: any[] }>(`${canteenBase(publicGroundId, publicCanteenId)}/menu/master`)
  return (data.items ?? []).map(normalizeMenuItem)
}

function menuItemFormData(input: Partial<CanteenMenuItemInput>): FormData {
  const fd = new FormData()
  if (input.name !== undefined) fd.append('name', input.name)
  if (input.category !== undefined) fd.append('category', input.category)
  if (input.description !== undefined) fd.append('description', input.description)
  if (input.price !== undefined) fd.append('price', String(input.price))
  if (input.stock !== undefined) fd.append('stock', String(input.stock))
  if (input.isActive !== undefined) fd.append('isActive', String(input.isActive))
  if (input.imageUri) {
    const name = input.imageUri.split('/').pop() || 'image.jpg'
    const ext = name.split('.').pop()?.toLowerCase()
    const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    // React Native FormData file shape.
    fd.append('imageFile', { uri: input.imageUri, name, type } as unknown as Blob)
  }
  return fd
}

export async function createCanteenMenuItem(
  publicGroundId: string,
  publicCanteenId: string,
  input: CanteenMenuItemInput,
): Promise<CanteenMenuItem> {
  const { data } = await api.post<{ item: any }>(
    `${canteenBase(publicGroundId, publicCanteenId)}/menu/master`,
    menuItemFormData(input),
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return normalizeMenuItem(data.item)
}

export async function updateCanteenMenuItem(
  publicGroundId: string,
  publicCanteenId: string,
  menuItemId: string,
  input: Partial<CanteenMenuItemInput>,
): Promise<CanteenMenuItem> {
  const { data } = await api.patch<{ item: any }>(
    `${canteenBase(publicGroundId, publicCanteenId)}/menu/master/${menuItemId}`,
    menuItemFormData(input),
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return normalizeMenuItem(data.item)
}

export async function deleteCanteenMenuItem(
  publicGroundId: string,
  publicCanteenId: string,
  menuItemId: string,
): Promise<void> {
  await api.delete(`${canteenBase(publicGroundId, publicCanteenId)}/menu/master/${menuItemId}`)
}

export async function fetchCanteenTodayMenu(
  publicGroundId: string,
  publicCanteenId: string,
): Promise<CanteenTodayMenuConfig> {
  const { data } = await api.get<CanteenTodayMenuConfig>(
    `${canteenBase(publicGroundId, publicCanteenId)}/menu/today/config`,
  )
  return { publishedAt: data.publishedAt, items: data.items ?? [] }
}

export async function saveCanteenTodayMenu(
  publicGroundId: string,
  publicCanteenId: string,
  items: CanteenTodayMenuEntryInput[],
): Promise<void> {
  await api.patch(`${canteenBase(publicGroundId, publicCanteenId)}/menu/today`, { items })
}

function normalizeOrder(row: any): CanteenOrder {
  return {
    id: row.id,
    userId: row.userId ?? row.user_id,
    customerName: row.customerName ?? row.customer_name ?? '',
    seatId: row.seatId ?? row.seat_id ?? null,
    items: (row.items ?? []).map((i: any) => ({
      id: i.id,
      foodId: i.foodId ?? i.food_id ?? i.id,
      name: i.name,
      price: Number(i.price ?? 0),
      qty: i.qty ?? i.quantity ?? 0,
    })),
    total: Number(row.total ?? 0),
    status: row.status,
    orderedAt: row.orderedAt ?? row.ordered_at ?? null,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at ?? null,
    completedAt: row.completedAt ?? row.completed_at ?? null,
  }
}

export async function fetchCanteenOrders(
  publicGroundId: string,
  publicCanteenId: string,
  opts: { page?: number; limit?: number; activeOnly?: boolean } = {},
): Promise<CanteenOrdersPage> {
  const params: Record<string, string | number> = { page: opts.page ?? 1, limit: opts.limit ?? 20 }
  if (opts.activeOnly) params.status = 'active'
  const { data } = await api.get<any>(`${canteenBase(publicGroundId, publicCanteenId)}/orders`, { params })
  return {
    page: data.page ?? 1,
    limit: data.limit ?? 20,
    total: data.total ?? 0,
    orders: (data.orders ?? []).map(normalizeOrder),
  }
}

export async function fetchCanteenOrder(
  publicGroundId: string,
  publicCanteenId: string,
  orderId: string,
): Promise<CanteenOrder> {
  const { data } = await api.get<{ order: any }>(`${canteenBase(publicGroundId, publicCanteenId)}/orders/${orderId}`)
  return normalizeOrder(data.order)
}

export async function updateCanteenOrderStatus(
  publicGroundId: string,
  publicCanteenId: string,
  orderId: string,
  status: CanteenOrderStatus,
): Promise<CanteenOrder> {
  const { data } = await api.patch<{ order: any }>(
    `${canteenBase(publicGroundId, publicCanteenId)}/orders/${orderId}/status`,
    { status },
  )
  return normalizeOrder(data.order)
}

export async function updateCanteenActivation(
  publicGroundId: string,
  publicCanteenId: string,
  isActive: boolean,
): Promise<GroundCanteen> {
  const { data } = await api.patch<{ canteen: GroundCanteen }>(
    `${canteenBase(publicGroundId, publicCanteenId)}/status`,
    { isActive },
  )
  return data.canteen
}

// --- Staff ----------------------------------------------------------
// Ground-scoped staff (GROUND_ADMIN / CANTEEN_STAFF). List/create/grant/
// revoke/disable are all authorized server-side against the URL's ground.

function normalizeStaffMember(row: any): OwnerStaffMember {
  return {
    userId: row.userId ?? row.user_id,
    name: row.name ?? row.user_name ?? '',
    email: row.email ?? row.user_email ?? null,
    phone: row.phone ?? row.user_phone ?? null,
    role: row.role,
    membershipId: row.membershipId ?? row.membership_id ?? row.id,
    createdAt: row.createdAt ?? row.created_at,
    permissions: row.permissions ?? [],
  }
}

export async function fetchGroundStaff(publicGroundId: string): Promise<OwnerStaffMember[]> {
  const { data } = await api.get<{ staff: any[] }>(`/ground-owner/grounds/${publicGroundId}/staff`)
  return (data.staff ?? []).map(normalizeStaffMember)
}

export async function createGroundStaff(
  publicGroundId: string,
  input: CreateStaffInput,
): Promise<{ membershipId: number | null }> {
  const { data } = await api.post<{ membership: any }>(`/ground-owner/grounds/${publicGroundId}/staff`, input)
  return { membershipId: data.membership?.id ?? null }
}

export async function fetchPermissionCatalog(): Promise<OwnerPermission[]> {
  const { data } = await api.get<{ permissions: OwnerPermission[] }>('/ground-owner/permissions/catalog')
  return data.permissions ?? []
}

export async function grantStaffPermission(
  publicGroundId: string,
  membershipId: number,
  permissionKey: string,
): Promise<void> {
  await api.post(`/ground-owner/grounds/${publicGroundId}/staff/${membershipId}/permissions`, { permissionKey })
}

export async function revokeStaffPermission(
  publicGroundId: string,
  membershipId: number,
  permissionKey: string,
): Promise<void> {
  await api.delete(`/ground-owner/grounds/${publicGroundId}/staff/${membershipId}/permissions/${permissionKey}`)
}

export async function disableGroundStaff(publicGroundId: string, membershipId: number): Promise<void> {
  await api.patch(`/ground-owner/grounds/${publicGroundId}/staff/${membershipId}/disable`)
}

// --- Analytics / reviews / notifications --------------------------

const analyticsBase = (publicGroundId: string) => `/ground-owner/grounds/${publicGroundId}/analytics`

export async function fetchGroundAnalytics(
  publicGroundId: string,
  range: OwnerAnalyticsRange,
): Promise<OwnerAnalytics> {
  const { data } = await api.get<OwnerAnalytics>(analyticsBase(publicGroundId), { params: { range } })
  return data
}

export async function fetchGroundAnalyticsTrends(
  publicGroundId: string,
  range: OwnerAnalyticsRange,
): Promise<OwnerAnalyticsTrends> {
  const { data } = await api.get<OwnerAnalyticsTrends>(`${analyticsBase(publicGroundId)}/trends`, {
    params: { range },
  })
  return { dateRange: data.dateRange, days: data.days ?? [] }
}

// The endpoint returns a raw CSV string (text/csv). There is no file-system
// or share dependency in the app, so callers can only preview the text.
export async function fetchGroundAnalyticsCsv(
  publicGroundId: string,
  range: OwnerAnalyticsRange,
): Promise<string> {
  const { data } = await api.get<string>(`${analyticsBase(publicGroundId)}/export`, {
    params: { range },
    responseType: 'text',
    transformResponse: (raw: string) => raw,
  })
  return typeof data === 'string' ? data : String(data)
}

export async function fetchGroundReviews(
  publicGroundId: string,
  opts: { page?: number; limit?: number } = {},
): Promise<OwnerReviewsResponse> {
  const { data } = await api.get<OwnerReviewsResponse>(`/ground-owner/grounds/${publicGroundId}/reviews`, {
    params: { page: opts.page ?? 1, limit: opts.limit ?? 20 },
  })
  return { reviews: data.reviews ?? [], pagination: data.pagination }
}

function normalizeGroundNotification(row: any): OwnerGroundNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body ?? null,
    isRead: row.isRead ?? row.is_read ?? false,
    createdAt: row.createdAt ?? row.created_at,
    relatedBookingId: row.relatedBookingId ?? row.related_booking_id ?? null,
    relatedMatchId: row.relatedMatchId ?? row.related_match_id ?? null,
    relatedOrderId: row.relatedOrderId ?? row.related_order_id ?? null,
  }
}

export async function fetchGroundNotifications(
  publicGroundId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<OwnerNotificationsResponse> {
  const { data } = await api.get<any>(`/ground-owner/grounds/${publicGroundId}/notifications`, {
    params: { limit: opts.limit ?? 20, offset: opts.offset ?? 0 },
  })
  return {
    notifications: (data.notifications ?? []).map(normalizeGroundNotification),
    total: data.total ?? 0,
    unreadCount: data.unreadCount ?? 0,
  }
}

export async function markGroundNotificationRead(publicGroundId: string, notificationId: number): Promise<void> {
  await api.post(`/ground-owner/grounds/${publicGroundId}/notifications/${notificationId}/read`)
}

export async function markAllGroundNotificationsRead(publicGroundId: string): Promise<void> {
  await api.post(`/ground-owner/grounds/${publicGroundId}/notifications/read-all`)
}
