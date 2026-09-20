import { findGroundByPublicId, findSingleGround, AmbiguousGroundError } from '../models/ground.model.js'
import { findCanteenByPublicId, findSingleCanteen, AmbiguousCanteenError } from '../models/canteen.model.js'
import { findActiveMembershipForAnyRole } from '../models/groundUser.model.js'
import { hasActivePermission } from '../models/permission.model.js'
import { respondMfaRequired } from '../services/mfaState.service.js'

// Phase 9 — ground-scoped authorization primitives, additive alongside the
// existing global RBAC in auth.js (requireRole/requireStaffRole/
// requireScorer are untouched and still govern every existing route).
//
// The flow these enforce (never the reverse):
//   authenticated req.user  ->  looked-up ground/canteen row  ->  active
//   ground_users membership  ->  allowed?  ->  next()
// A client-supplied ground/canteen id is used only to look up which
// resource is being asked for; authorization always comes from a DB
// membership row keyed off req.user.id, never from the id itself.
//
// Must run after requireAuth (needs req.user).

function isSuperAdmin(user) {
  return user?.role === 'staff' && user?.staff_role === 'super_admin'
}

// Super Admin bypasses membership entirely (Step 14) — they are not required
// to hold a ground_users row for every ground merely to administer LOC.
export function requireGroundRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      const ground = await findGroundByPublicId(req.params.publicGroundId)
      if (!ground) {
        return res.status(404).json({ error: 'Ground not found.' })
      }

      if (isSuperAdmin(req.user)) {
        // Phase 6 — Super Admin's own MFA mandate applies even when they're
        // exercising access via this bypass, not just on staff-only routes.
        if (!req.mfaVerified) return respondMfaRequired(res)
        req.ground = ground
        return next()
      }

      const membership = await findActiveMembershipForAnyRole(req.user.id, ground.id, allowedRoles)
      if (!membership) {
        return res.status(403).json({ error: 'You do not have permission to perform this action at this ground.' })
      }

      // Phase 6 — requireGroundRole is only ever called with 'GROUND_OWNER'
      // as the sole allowed role (verified across the whole route tree), so
      // a found membership here always means GROUND_OWNER by construction.
      // Written as an explicit check anyway (not "else assume") so this
      // stays correct even if a future caller passes additional roles.
      if (membership.role === 'GROUND_OWNER' && !req.mfaVerified) {
        return respondMfaRequired(res)
      }

      req.ground = ground
      req.groundMembership = membership
      next()
    } catch (err) {
      next(err)
    }
  }
}

// Phase 5 — granular Staff permissions, layered on top of the same
// ground_users resolution requireGroundRole uses. GROUND_OWNER never needs a
// staff_permissions row (full implicit access to their own ground); a
// GROUND_ADMIN/CANTEEN_STAFF membership must hold an explicit ACTIVE grant
// for `permissionKey`. Deliberately never checks the dead 'UMPIRE'/'SCORER'
// ground_users roles — see docs/AUTHORIZATION.md for why those stay dead.
//
// Sets req.ground/req.groundMembership identically to requireGroundRole
// (verified: no service downstream of either middleware reads
// req.groundMembership — only req.ground — so this is a drop-in swap on any
// route, not a breaking change to what the controller/service receives).
const GROUND_STAFF_ROLES = ['GROUND_OWNER', 'GROUND_ADMIN', 'CANTEEN_STAFF']

// Ground Owner Staff Audit — accepts one or more permission keys (rest args,
// same variadic shape as requireGroundRole above); a membership passes if it
// holds an ACTIVE grant for ANY of them. Every pre-existing single-key call
// site is unaffected (a 1-element list behaves identically to the old single
// string). Needed so a route can honor an already-established "VIEW-or-MANAGE
// grants read access" pattern (see bookingConflict.service.js#assertCanViewBooking,
// which already does this exact any-of check for a different booking surface)
// without duplicating the permission-check loop at each call site.
export function requireGroundPermission(...permissionKeys) {
  return async (req, res, next) => {
    try {
      const ground = await findGroundByPublicId(req.params.publicGroundId)
      if (!ground) {
        return res.status(404).json({ error: 'Ground not found.' })
      }

      if (isSuperAdmin(req.user)) {
        if (!req.mfaVerified) return respondMfaRequired(res)
        req.ground = ground
        return next()
      }

      const membership = await findActiveMembershipForAnyRole(req.user.id, ground.id, GROUND_STAFF_ROLES)
      if (!membership) {
        return res.status(403).json({ error: 'You do not have permission to perform this action at this ground.' })
      }
      req.ground = ground
      req.groundMembership = membership

      if (membership.role === 'GROUND_OWNER') {
        // Phase 6 — Owner's own MFA mandate. Never checked for the STAFF
        // (permission-grant) branch below — MFA is not mandatory for STAFF.
        if (!req.mfaVerified) return respondMfaRequired(res)
        return next()
      }

      const grants = await Promise.all(permissionKeys.map((key) => hasActivePermission(membership.id, key)))
      if (!grants.some(Boolean)) {
        return res.status(403).json({ error: 'You do not have permission to perform this action at this ground.' })
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}

// Phase 24 — resolves req.ground from :publicGroundId with NO role/
// membership check, for routes any authenticated user (a player creating
// their own team's booking, not ground staff) needs to reach — the ground-
// scoped-but-not-staff-gated counterpart to attachGroundCanteenContext
// below. Authorization for what the request is actually allowed to DO is
// then owned entirely by the service layer (bookingConflict.service.js),
// same "resolve tenancy here, authorize there" split attachGroundCanteenContext
// already uses for its own public variant.
export async function attachGroundContext(req, res, next) {
  try {
    const ground = await findGroundByPublicId(req.params.publicGroundId)
    if (!ground) {
      return res.status(404).json({ error: 'Ground not found.' })
    }
    req.ground = ground
    next()
  } catch (err) {
    next(err)
  }
}

// Canteen access foundation (Step 12/13, Phase 9): resolves the canteen's
// OWN ground_id from the database — never from the client — then runs the
// same membership check requireGroundRole does. Does NOT verify against a
// separately URL-supplied :publicGroundId (there wasn't one in Phase 9) —
// for that stricter guarantee, Phase 11 below adds requireGroundCanteenRole.
export function requireCanteenRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      const canteen = await findCanteenByPublicId(req.params.publicCanteenId)
      if (!canteen) {
        return res.status(404).json({ error: 'Canteen not found.' })
      }

      if (isSuperAdmin(req.user)) {
        req.canteen = canteen
        return next()
      }

      const membership = await findActiveMembershipForAnyRole(req.user.id, canteen.ground_id, allowedRoles)
      if (!membership) {
        return res.status(403).json({ error: 'You do not have permission to perform this action at this canteen.' })
      }

      req.canteen = canteen
      req.groundMembership = membership
      next()
    } catch (err) {
      next(err)
    }
  }
}

// ---------------------------------------------------------------------------
// Shared authorization core (Phase 10/11) — given an ALREADY-RESOLVED
// canteen row (however it was resolved — singleton lookup or URL-verified),
// decide access via the same OR-composed rule everywhere it's needed:
//   (a) the EXISTING global staff_role_id system, or
//   (b) a real ground_users membership.
// Written exactly once so requireCanteenStaffAccess (Phase 10, transitional
// routes) and requireGroundCanteenRole (Phase 11, real multi-ground routes)
// never duplicate the membership-check logic (Step 2).
// ---------------------------------------------------------------------------

function isLegacyStaffAllowed(user, legacyStaffRoles) {
  return user?.role === 'staff' && (legacyStaffRoles === 'any' || legacyStaffRoles.includes(user?.staff_role))
}

// Phase 6 — returns { allowed, mfaRequired } rather than a bare boolean so
// callers can answer with a 403 MFA_REQUIRED (matching requireGroundRole/
// requireGroundPermission) instead of the generic permission-denied message
// when the ONLY thing missing is MFA verification for a Super Admin or
// Ground Owner. Plain legacy 'admin'/'canteen_staff' staff and
// GROUND_ADMIN/CANTEEN_STAFF memberships are never MFA-mandatory — only the
// isSuperAdmin branch and the GROUND_OWNER membership branch are gated,
// exactly the same two cases requireGroundRole/requireGroundPermission gate.
// Exported for canteenOrder.controller.js#getOrder (CUSTOMER_CANTEEN_MIGRATION)
// — reused as a fallback check ("is this caller staff for this canteen?")
// once the controller has already established the requester is NOT the
// order's own customer, rather than re-deriving this same staff-membership
// logic a second time.
export async function authorizeResolvedCanteen(req, canteen, { legacyStaffRoles = [], groundRoles = [] }) {
  if (isSuperAdmin(req.user)) {
    if (!req.mfaVerified) return { allowed: false, mfaRequired: true }
    req.canteen = canteen
    return { allowed: true }
  }
  if (isLegacyStaffAllowed(req.user, legacyStaffRoles)) {
    req.canteen = canteen
    return { allowed: true }
  }
  const membership = await findActiveMembershipForAnyRole(req.user.id, canteen.ground_id, groundRoles)
  if (!membership) return { allowed: false }
  if (membership.role === 'GROUND_OWNER' && !req.mfaVerified) return { allowed: false, mfaRequired: true }
  req.canteen = canteen
  req.groundMembership = membership
  return { allowed: true }
}

// ---------------------------------------------------------------------------
// Phase 10 — resolves req.canteen for the TRANSITIONAL single-canteen
// routes (/api/canteen/menu, /api/canteen/orders — no :publicCanteenId in
// the URL at all). Kept operating exactly as before for the existing
// frontend (Phase 11 Step 20/30 — no frontend redesign this phase); the
// REAL multi-ground routes below never use these.
// ---------------------------------------------------------------------------

// No auth/role check — for PUBLIC canteen reads (menu list) and any-
// authenticated-user actions (placing an order, viewing your own order
// history) that still need to know WHICH canteen they're operating against.
export async function attachCurrentCanteen(req, res, next) {
  try {
    const canteen = await findSingleCanteen()
    if (!canteen) {
      return res.status(404).json({ error: 'No canteen is configured yet.' })
    }
    req.canteen = canteen
    next()
  } catch (err) {
    if (err instanceof AmbiguousCanteenError) {
      return res.status(409).json({ error: 'Multiple canteens now exist — use the ground/canteen-scoped routes instead of the legacy /canteen/* routes.' })
    }
    next(err)
  }
}

// The Phase 10 Step 16/17 integration point: gates canteen ADMINISTRATION
// (menu/TodayMenu/order management) behind either credential — see
// authorizeResolvedCanteen's comment for why this is OR, not a replacement.
//
// `legacyStaffRoles` deliberately mirrors whichever OLD check the route
// used before (requireStaffRole('super_admin','admin') for menu management
// vs requireRole('staff') — ANY staff — for order management). Passing the
// wrong list here would silently WIDEN access beyond what the route already
// granted, so each call site states its own list explicitly (or 'any').
export function requireCanteenStaffAccess({ legacyStaffRoles = [], groundRoles = [] } = {}) {
  return async (req, res, next) => {
    try {
      const canteen = await findSingleCanteen()
      if (!canteen) {
        return res.status(404).json({ error: 'No canteen is configured yet.' })
      }
      const result = await authorizeResolvedCanteen(req, canteen, { legacyStaffRoles, groundRoles })
      if (result.mfaRequired) return respondMfaRequired(res)
      if (!result.allowed) {
        return res.status(403).json({ error: 'You do not have permission to perform this action at this canteen.' })
      }
      next()
    } catch (err) {
      if (err instanceof AmbiguousCanteenError) {
        return res.status(409).json({ error: 'Multiple canteens now exist — use the ground/canteen-scoped routes instead of the legacy /canteen/* routes.' })
      }
      next(err)
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 11 — real multi-ground/canteen URL context resolution:
//   /grounds/:publicGroundId/canteens/:publicCanteenId/...
// Unlike requireCanteenRole (Phase 9), this ALSO verifies the canteen
// belongs to the SAME ground the URL claims (Step 5/7) — a request for
// Ground A's URL with Canteen B's real id (which actually belongs to Ground
// B) is treated as not-found for this URL, never silently reinterpreted as
// "the canteen the id actually belongs to."
// ---------------------------------------------------------------------------

// Resolves + verifies req.ground/req.canteen with NO role/membership check —
// for PUBLIC ground/canteen-scoped reads (a future public menu-by-ground
// page). Kept separate from requireGroundCanteenRole so a public route can
// never accidentally end up gated behind a role check by a copy-paste.
export async function attachGroundCanteenContext(req, res, next) {
  try {
    const ground = await findGroundByPublicId(req.params.publicGroundId)
    if (!ground) {
      return res.status(404).json({ error: 'Ground not found.' })
    }
    const canteen = await findCanteenByPublicId(req.params.publicCanteenId)
    if (!canteen || canteen.ground_id !== ground.id) {
      // Deliberately the SAME 404 whether the canteen id doesn't exist at
      // all or exists but belongs to a different ground (Step 29) — never
      // confirms to the caller that a given canteen id is real but "just
      // not here."
      return res.status(404).json({ error: 'Canteen not found.' })
    }
    req.ground = ground
    req.canteen = canteen
    next()
  } catch (err) {
    next(err)
  }
}

// ---------------------------------------------------------------------------
// Phase 12 — resolves req.ground for admin writes to tables that only just
// gained a ground_id (ground_photos/amenities, Step 1's discovery). Same
// shape as attachCurrentCanteen: safe only because exactly one ground
// exists today; fails 409 the moment a second one does, rather than ever
// guessing which ground a new photo/amenity belongs to.
// ---------------------------------------------------------------------------
export async function attachSingleGroundContext(req, res, next) {
  try {
    const ground = await findSingleGround()
    if (!ground) {
      return res.status(404).json({ error: 'No ground is configured yet.' })
    }
    req.ground = ground
    next()
  } catch (err) {
    if (err instanceof AmbiguousGroundError) {
      return res.status(409).json({ error: 'Multiple grounds now exist — this endpoint needs a ground-scoped route before it can accept new uploads.' })
    }
    next(err)
  }
}

// The real multi-ground authorization entry point (Step 8/9/10): resolves
// + verifies ground/canteen consistency, then runs the exact same
// OR-composed check requireCanteenStaffAccess uses (legacy staff OR
// ground_users membership) — see authorizeResolvedCanteen. Super Admin
// still receives the fully resolved req.ground/req.canteen context (Step 8:
// "bypassing authorization does NOT mean bypassing tenancy resolution").
export function requireGroundCanteenRole({ legacyStaffRoles = [], groundRoles = [] } = {}) {
  return async (req, res, next) => {
    try {
      const ground = await findGroundByPublicId(req.params.publicGroundId)
      if (!ground) {
        return res.status(404).json({ error: 'Ground not found.' })
      }
      const canteen = await findCanteenByPublicId(req.params.publicCanteenId)
      if (!canteen || canteen.ground_id !== ground.id) {
        return res.status(404).json({ error: 'Canteen not found.' })
      }
      req.ground = ground

      const result = await authorizeResolvedCanteen(req, canteen, { legacyStaffRoles, groundRoles })
      if (result.mfaRequired) return respondMfaRequired(res)
      if (!result.allowed) {
        return res.status(403).json({ error: 'You do not have permission to perform this action at this ground/canteen.' })
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}
