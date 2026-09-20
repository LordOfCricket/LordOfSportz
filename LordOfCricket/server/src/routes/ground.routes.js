import express from 'express'
import { listNearbyGrounds, listGroundsByCity, listAllGrounds, listGroundCities, getGroundProfile, registerGround } from '../controllers/ground.controller.js'
import { requireAuth } from '../middlewares/auth.js'
import { groundWriteLimiter } from '../middlewares/rateLimit.js'

const router = express.Router()

// All public, no auth — ground discovery has to work for a logged-out
// visitor deciding which ground to even sign in for.
//
// /nearby and /search MUST both be registered before /:publicGroundId in
// this file (same footgun documented in routes/index.js for players'/teams'
// /compare route — Express matches routes in registration order, and
// /:publicGroundId would otherwise swallow the literal segments). The bare
// '/' doesn't have this problem (:publicGroundId requires exactly one path
// segment, '/' has zero), but is kept alongside them for readability.
router.get('/nearby', listNearbyGrounds)
// Phase 13 (post-report revision) — city-based discovery, the frontend's
// primary path now (listNearbyGrounds/lat-lng above is left intact but
// unused by the frontend — see ground.model.js's findActiveGroundsByCity).
router.get('/search', listGroundsByCity)
// Homepage redesign (Stage 1) — real distinct cities for the searchable
// CitySelector. Also needs to be registered before /:publicGroundId.
router.get('/cities', listGroundCities)
// "Grounds already registered on LOC" — Featured Grounds (sort=newest) and
// any future full-browse view.
router.get('/', listAllGrounds)
// Self-serve ground registration — "want to register your ground on LOC."
// Any logged-in user, not staff-only; creates a PENDING ground_owner_requests
// row for super_admin review (see /ground-owner-requests) rather than a
// ground itself — no ground or membership exists until that request is
// approved. Method-distinct from the GET '/' above so there's no
// path-ordering concern.
router.post('/', groundWriteLimiter, requireAuth, registerGround)
router.get('/:publicGroundId', getGroundProfile)

export default router
