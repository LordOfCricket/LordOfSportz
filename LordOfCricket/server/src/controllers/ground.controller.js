import {
  findNearbyActiveGrounds,
  findActiveGroundsByCity,
  findAllActiveGrounds,
  findDistinctActiveCities,
  findPublicActiveGroundByPublicId,
} from '../models/ground.model.js'
import { findGroundPhotosByGroundId } from '../models/groundPhoto.model.js'
import { findAmenitiesByGroundId } from '../models/amenity.model.js'
import { findByGroundId as findAmenityCatalogByGroundId } from '../models/groundAmenity.model.js'
import { findCanteensByGroundId } from '../models/canteen.model.js'
import { listActivePricingSlots } from '../services/groundPricing.service.js'
import * as groundOwnerRequestService from '../services/groundOwnerRequest.service.js'
import { mapRegistrationBody } from './groundOwnerRequest.controller.js'

// Phase 12 Step 9/11 — documented defaults/limits. DEFAULT_RADIUS_KM is the
// "within 10 km" example the brief itself uses for the expected UX.
// MAX_RADIUS_KM (100) covers even the largest Indian metro areas (Step 5
// requires SOME cap — an unrestricted radius is a full-table distance
// computation with no benefit over just listing all grounds).
// DEFAULT_LIMIT/MAX_LIMIT mirror tournament.service.js's existing
// pagination convention (limit=20 default, clamped to 50) rather than
// inventing a second one.
const DEFAULT_RADIUS_KM = 10
const MAX_RADIUS_KM = 100
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

// Step 5 — reject missing/NaN/Infinity/non-numeric/out-of-range values.
// Query params always arrive as strings; Number('') is 0 (a false pass) and
// Number('abc') is NaN, so both must be checked explicitly.
export function parseCoordinate(raw, min, max) {
  if (raw === undefined || raw === '') return { error: true }
  const value = Number(raw)
  if (!isFiniteNumber(value) || value < min || value > max) return { error: true }
  return { value }
}

export function parseRadiusKm(raw) {
  if (raw === undefined || raw === '') return { value: DEFAULT_RADIUS_KM }
  const value = Number(raw)
  if (!isFiniteNumber(value) || value <= 0) return { error: true }
  return { value: Math.min(value, MAX_RADIUS_KM) }
}

export function parsePagination(query) {
  const rawLimit = query.limit === undefined ? DEFAULT_LIMIT : Number(query.limit)
  const rawPage = query.page === undefined ? 1 : Number(query.page)
  const limit = Math.max(1, Math.min(isFiniteNumber(rawLimit) ? Math.trunc(rawLimit) : DEFAULT_LIMIT, MAX_LIMIT))
  const page = Math.max(1, isFiniteNumber(rawPage) ? Math.trunc(rawPage) : 1)
  return { limit, page, offset: (page - 1) * limit }
}

// Step 8 — round only at the presentation boundary; filtering (in the SQL
// query itself) already used the full-precision value.
export function roundDistance(km) {
  return Math.round(Number(km) * 100) / 100
}

// Shared row -> public card mapping for all three discovery flows (nearby/
// city/all) — one place defines "what a ground card looks like on the
// wire" instead of three near-identical object literals drifting apart.
function serializeGroundCard(row) {
  return {
    publicGroundId: row.public_ground_id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    state: row.state,
    country: row.country,
    primaryPhoto: row.primary_photo,
    // Homepage redesign (Stage 1) — real per-ground amenity names, powers
    // GroundCard's facility chips and GroundFiltersBar's Facilities filter.
    // array_agg over zero rows is SQL NULL, never [] — coalesce here so the
    // client only ever sees a real array.
    amenities: row.amenity_names || [],
    // Phase 13 — real rating_avg/rating_count columns (see schema.sql),
    // already recomputed on every match_feedback submission by
    // ratingAggregation.service.js. NULL ratingAvg + ratingCount=0 IS the
    // honest "no reviews yet" state — never coerced to 0/fabricated.
    // NUMERIC(3,2) arrives from pg as a string; Number() only when non-null.
    ratingAvg: row.rating_avg !== null && row.rating_avg !== undefined ? Number(row.rating_avg) : null,
    ratingCount: row.rating_count ?? 0,
    // Ground Time-Slot Pricing — MIN(active slot price), or null when no
    // active pricing is configured yet. Never a fabricated ₹0; the frontend
    // renders null as "Price on request".
    startingPrice: row.starting_price !== null && row.starting_price !== undefined ? Number(row.starting_price) : null,
  }
}

export async function listNearbyGrounds(req, res, next) {
  try {
    const lat = parseCoordinate(req.query.lat, -90, 90)
    if (lat.error) return res.status(400).json({ error: 'lat must be a number between -90 and 90.' })
    const lng = parseCoordinate(req.query.lng, -180, 180)
    if (lng.error) return res.status(400).json({ error: 'lng must be a number between -180 and 180.' })
    const radius = parseRadiusKm(req.query.radiusKm)
    if (radius.error) return res.status(400).json({ error: `radiusKm must be a positive number (maximum ${MAX_RADIUS_KM}).` })

    const { limit, page, offset } = parsePagination(req.query)

    const { rows, total } = await findNearbyActiveGrounds({
      latitude: lat.value,
      longitude: lng.value,
      radiusKm: radius.value,
      limit,
      offset,
    })

    res.json({
      grounds: rows.map((row) => ({ ...serializeGroundCard(row), distanceKm: roundDistance(row.distance_km) })),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    })
  } catch (err) {
    next(err)
  }
}

const MAX_CITY_LENGTH = 100

// Phase 13 (post-report revision) — city replaces lat/lng as the primary
// discovery input (product decision — most grounds don't have real
// coordinates yet). No distanceKm in the response: city matching involves
// no coordinates at all, so there's nothing honest to compute a distance
// from. listNearbyGrounds above is untouched and still reachable, just no
// longer the frontend's primary path.
export async function listGroundsByCity(req, res, next) {
  try {
    const city = typeof req.query.city === 'string' ? req.query.city.trim() : ''
    if (!city) return res.status(400).json({ error: 'city is required.' })
    if (city.length > MAX_CITY_LENGTH) return res.status(400).json({ error: `city must be ${MAX_CITY_LENGTH} characters or fewer.` })

    const { limit, page, offset } = parsePagination(req.query)
    const { rows, total } = await findActiveGroundsByCity({ city, limit, offset })

    res.json({
      grounds: rows.map(serializeGroundCard),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    })
  } catch (err) {
    next(err)
  }
}

const ALLOWED_ALL_GROUNDS_SORTS = ['name', 'newest', 'city']

// "Grounds already registered on LOC" — the platform homepage's default
// browse list, shown below the hero without requiring a city search first.
// No filter at all beyond ACTIVE status. `sort=newest` is what
// FeaturedGrounds.jsx uses (real created_at ordering, not a fabricated
// "featured" flag the schema doesn't have) — `sort` is validated against a
// fixed allow-list, never passed through to SQL as-is.
export async function listAllGrounds(req, res, next) {
  try {
    const { limit, page, offset } = parsePagination(req.query)
    const sort = ALLOWED_ALL_GROUNDS_SORTS.includes(req.query.sort) ? req.query.sort : 'name'
    const { rows, total } = await findAllActiveGrounds({ limit, offset, sort })

    res.json({
      grounds: rows.map(serializeGroundCard),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    })
  } catch (err) {
    next(err)
  }
}

// Real, distinct city names with at least one ACTIVE ground — powers the
// searchable CitySelector. Never a hardcoded list.
export async function listGroundCities(req, res, next) {
  try {
    const cities = await findDistinctActiveCities()
    res.json({ cities })
  } catch (err) {
    next(err)
  }
}

// Self-serve ground registration — "want to register your ground on LOC."
// Phase 4: this used to create the ground AND grant GROUND_OWNER membership
// immediately (the exact bug the brief names — ownership granted before any
// review). It's now a thin, logged-in-friendly repoint to
// groundOwnerRequest.service.js#submitRequest — the same PENDING-request/
// super_admin-approval flow the new public POST /ground-owner-requests
// endpoint uses, just with the applicant's identity taken from their
// session (req.user) instead of typed into the request body, since this
// route requires requireAuth (ground.routes.js, unchanged). No ground row
// and no ground_users membership are created here anymore — see
// groundOwnerRequest.service.js#approveRequest for where that now happens,
// only after a super_admin decision.
// Ground Registration feature — applicant email/phone still come from the
// session (never req.body — the whole point of this being the
// authenticated entry point), but now fall back to whatever the wizard's
// own contact-verification step just added to the account if either was
// missing (groundContactVerification.service.js persists onto req.user's
// own row, so a fresh /auth/me-shaped req.user already reflects it by the
// time this runs, same as any other requireAuth request). agreedToTerms/
// featuredPhotos/galleryPhotos/amenityKeys are new fields the old form
// never sent — validated inside submitRequest, not here.
export async function registerGround(req, res, next) {
  try {
    const request = await groundOwnerRequestService.submitRequest(mapRegistrationBody(req.body || {}, req.user), req.user.id)

    res.status(201).json({
      request: { publicRequestId: request.public_request_id, groundName: request.ground_name, status: request.status },
    })
  } catch (err) {
    next(err)
  }
}

export async function getGroundProfile(req, res, next) {
  try {
    const ground = await findPublicActiveGroundByPublicId(req.params.publicGroundId)
    // Step 24 — DRAFT/SUSPENDED and "doesn't exist at all" return the exact
    // same 404: the query already filtered on status = 'ACTIVE', so this
    // branch can't distinguish the two cases even if it wanted to.
    if (!ground) {
      return res.status(404).json({ error: 'Ground not found.' })
    }

    const [photos, amenities, amenityCatalog, canteens, pricingSlots] = await Promise.all([
      findGroundPhotosByGroundId(ground.id),
      findAmenitiesByGroundId(ground.id),
      findAmenityCatalogByGroundId(ground.id),
      findCanteensByGroundId(ground.id),
      listActivePricingSlots(ground.id),
    ])

    res.json({
      ground: {
        publicGroundId: ground.public_ground_id,
        slug: ground.slug,
        name: ground.name,
        description: ground.description,
        addressLine: ground.address_line,
        city: ground.city,
        state: ground.state,
        country: ground.country,
        postalCode: ground.postal_code,
        latitude: ground.latitude,
        longitude: ground.longitude,
        phone: ground.phone,
        email: ground.email,
        website: ground.website,
        // Phase 23 — non-sensitive (a business's hours are public
        // information, same category as its address/phone above); null
        // means "not configured, platform default applies" (docs/
        // ARCHITECTURE.md domain/booking/policy.js), not "closed."
        openingHour: ground.opening_hour !== null && ground.opening_hour !== undefined ? Number(ground.opening_hour) : null,
        closingHour: ground.closing_hour !== null && ground.closing_hour !== undefined ? Number(ground.closing_hour) : null,
        // Phase 13 — same honest-absence convention as serializeGroundCard:
        // NULL ratingAvg + ratingCount=0 for a ground with no reviews yet.
        ratingAvg: ground.rating_avg !== null && ground.rating_avg !== undefined ? Number(ground.rating_avg) : null,
        ratingCount: ground.rating_count ?? 0,
      },
      photos: photos.map((p) => ({ title: p.title, imageUrl: p.image_url, sortOrder: p.sort_order, isFeatured: p.is_featured })),
      // Legacy, super_admin-uploaded-photo amenities (unchanged) — kept
      // alongside, never replaced by, the new catalog-based list below.
      amenities: amenities.map((a) => ({ name: a.name, imageUrl: a.image_url, sortOrder: a.sort_order })),
      // Ground Registration feature — LOC-predefined icon+name pairs the
      // owner selected at registration (or later edited), never an
      // owner-controlled image. `amenities` above is untouched/still
      // populated independently for older grounds set up before this
      // catalog existed; a ground can have either, both, or neither.
      amenityCatalog: amenityCatalog.map((a) => ({ key: a.key, name: a.name, icon: a.icon })),
      // Step 17 — gallery_images has no ground relationship yet (Step 1's
      // discovery) and the brief explicitly forbids redesigning it this
      // phase. Returning null (not the global gallery) is the only choice
      // that can't leak another future ground's images once one exists.
      gallery: null,
      // Step 18 — an array, not a single object: canteens.ground_id has no
      // UNIQUE constraint (a ground may have more than one canteen per the
      // Phase 8 schema comment), so collapsing to one would silently hide
      // real canteens. Only the fields Step 18 allows — never staff/orders/
      // menu/internal id.
      canteens: canteens.map((c) => ({ publicCanteenId: c.public_canteen_id, name: c.name, isActive: c.is_active })),
      // Ground Time-Slot Pricing — active slots only, same never-leak-
      // inactive-pricing posture as every other public read here. No
      // internal id, no ground_id — just the time band + price a customer
      // needs to see before booking.
      pricingSlots: pricingSlots.map((s) => ({ startTime: s.start_time, endTime: s.end_time, price: Number(s.price) })),
    })
  } catch (err) {
    next(err)
  }
}
