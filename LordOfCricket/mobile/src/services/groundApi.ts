import api from './api'

export interface GroundPhoto {
  title: string | null
  imageUrl: string
  sortOrder: number
  isFeatured: boolean
}

export interface GroundAmenity {
  key?: string
  name: string
  icon?: string | null
  imageUrl?: string | null
}

export interface GroundPricingSlot {
  startTime: string
  endTime: string
  price: number
}

export interface GroundCanteen {
  publicCanteenId: string
  name: string
  isActive: boolean
}

// Full public ground profile — GET /grounds/:publicGroundId returns every
// field below (ground.controller.js#getGroundProfile). The website's
// GroundHomePage already renders all of it; the mobile screen previously
// discarded everything except name/address/city/state/photo.
export interface GroundDetail {
  publicGroundId: string
  slug: string | null
  name: string
  description: string | null
  addressLine: string | null
  city: string | null
  state: string | null
  country: string | null
  postalCode: string | null
  latitude: number | string | null
  longitude: number | string | null
  phone: string | null
  email: string | null
  website: string | null
  openingHour: number | null
  closingHour: number | null
  ratingAvg: number | null
  ratingCount: number
  primaryPhoto: string | null
  photos: GroundPhoto[]
  amenities: GroundAmenity[]
  amenityCatalog: GroundAmenity[]
  pricingSlots: GroundPricingSlot[]
  canteens: GroundCanteen[]
}

export interface FeaturedGround {
  publicGroundId: string
  name: string
  city: string | null
  state: string | null
  primaryPhoto: string | null
}

export interface FeaturedGroundsResponse {
  grounds: FeaturedGround[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

/**
 * GET /grounds
 * Registered grounds on LOC — same public endpoint the website's
 * "Find Your Perfect Ground" section uses.
 */
export async function getFeaturedGrounds(limit = 8): Promise<FeaturedGroundsResponse> {
  const response = await api.get<FeaturedGroundsResponse>('/grounds', { params: { page: 1, limit } })
  return response.data
}

export async function getNearbyGrounds(latitude: number, longitude: number, radiusKm = 10) {
  // Backend GET /grounds/nearby (ground.controller.js#listNearbyGrounds)
  // reads `lat` / `lng` query params — same contract the website uses
  // (client/src/services/groundsApi.js). Sending `latitude` / `longitude`
  // made the server reject the request with 400 ("lat must be a number").
  const response = await api.get('/grounds/nearby', {
    params: {
      lat: latitude,
      lng: longitude,
      radiusKm,
    },
  })
  return response.data
}

/**
 * GET /grounds/search?city= — active grounds in a city
 * (ground.controller.js#listGroundsByCity). The only text-based ground
 * lookup the backend supports (there is no ground-name search); the
 * website's ground discovery uses the same endpoint. Returns 400 when
 * `city` is blank, so callers must pass a non-empty term.
 */
export async function searchGroundsByCity(city: string, limit = 10, offset = 0): Promise<FeaturedGroundsResponse> {
  const response = await api.get<FeaturedGroundsResponse>('/grounds/search', {
    params: { city, limit, offset },
  })
  return response.data
}

interface GroundProfileResponse {
  ground: Omit<
    GroundDetail,
    'primaryPhoto' | 'photos' | 'amenities' | 'amenityCatalog' | 'pricingSlots' | 'canteens'
  >
  photos?: GroundPhoto[]
  amenities?: GroundAmenity[]
  amenityCatalog?: GroundAmenity[]
  pricingSlots?: GroundPricingSlot[]
  canteens?: GroundCanteen[]
}

/**
 * GET /grounds/:publicGroundId
 * Response is { ground, photos, amenities, amenityCatalog, pricingSlots,
 * canteens } — flattened here into one GroundDetail so the screen has the
 * whole public profile (same data the website's GroundHomePage renders).
 * `primaryPhoto` = the featured photo, else the first.
 */
export async function getGroundById(publicGroundId: string): Promise<GroundDetail> {
  const response = await api.get<GroundProfileResponse>(`/grounds/${publicGroundId}`)
  const { ground, photos = [], amenities = [], amenityCatalog = [], pricingSlots = [], canteens = [] } = response.data
  const featured = photos.find((p) => p.isFeatured) ?? photos[0]
  return {
    ...ground,
    photos,
    amenities,
    amenityCatalog,
    pricingSlots,
    canteens,
    primaryPhoto: featured?.imageUrl ?? null,
  }
}

export async function searchGrounds(query: string, limit = 20, offset = 0) {
  const response = await api.get('/geocode', { params: { q: query, limit, offset } })
  return response.data
}

export async function getAvailability(date: string, publicGroundId?: string) {
  const response = await api.get('/bookings/availability', { params: { date, publicGroundId } })
  return response.data
}

export async function getGroundTimeline(date: string) {
  const response = await api.get('/ground/timeline', { params: { date } })
  return response.data
}

export async function getMyBookings() {
  const response = await api.get('/bookings/my')
  return response.data
}

export async function createBooking(booking: {
  startTime: string
  purpose?: string
  expectedPlayers?: number
  notes?: string
  contactPhone?: string
  contactEmail?: string
  clientActionId?: string
  publicGroundId?: string
}) {
  const response = await api.post('/bookings', booking)
  return response.data
}

export async function cancelBooking(publicBookingId: string) {
  const response = await api.post(`/bookings/${publicBookingId}/cancel`)
  return response.data
}

export async function createTeamBooking(
  publicGroundId: string,
  bookingPurpose: 'MATCH' | 'PRACTICE',
  startTime: string,
  endTime: string,
  teamId: number,
  participantPlayerIds: number[]
) {
  const response = await api.post(`/grounds/${publicGroundId}/bookings`, {
    bookingPurpose,
    startTime,
    endTime,
    teamId,
    participantPlayerIds,
  })
  return response.data
}
