import * as groundOwnerService from '../services/groundOwner.service.js'
import * as groundOwnerAnalyticsService from '../services/groundOwnerAnalytics.service.js'
import * as groundOwnerReviewsService from '../services/groundOwnerReviews.service.js'
import * as notificationService from '../services/groundNotification.service.js'
import { recommendUmpiresForMatch } from '../services/umpireRecommendation.service.js'
import { publishMatchState } from '../realtime/cricketRealtime.js'
import { updateGroundProfile as updateGroundProfileModel } from '../models/ground.model.js'
import {
  createStaffForGround,
  listStaffForGround,
  listPermissionCatalog,
  grantStaffPermission,
  revokeStaffPermission,
  disableStaffMembership,
} from '../services/groundStaff.service.js'

export async function listMyGrounds(req, res, next) {
  try {
    const grounds = await groundOwnerService.listMyGrounds(req.user.id)
    res.json({ grounds })
  } catch (err) {
    next(err)
  }
}

// Phase 1 — Ground Owner profile updates. req.ground is resolved + authorized
// by requireGroundRole('GROUND_OWNER') before this ever runs. Only whitelisted
// fields (name, description, phone, email, website, + Phase 4 location fields)
// are accepted. ownerId, userId, groundId are never trusted from the request
// body — authorization is always determined from req.ground.id (already verified
// owned by req.user).
export async function updateGroundProfile(req, res, next) {
  try {
    const allowed = ['name', 'description', 'phone', 'email', 'website', 'addressLine', 'city', 'state', 'postalCode', 'latitude', 'longitude', 'openingHour', 'closingHour']
    const updates = {}
    const errors = []

    for (const field of allowed) {
      if (field in req.body) {
        const value = req.body[field]

        // Trim string values; null/undefined pass through
        if (typeof value === 'string') {
          updates[field] = value.trim()
        } else {
          updates[field] = value
        }

        // Validate specific fields
        if (field === 'addressLine' && typeof updates[field] === 'string' && updates[field].length > 255) {
          errors.push('Address line must be 255 characters or fewer.')
        }
        if (field === 'city' && typeof updates[field] === 'string' && updates[field].length > 100) {
          errors.push('City must be 100 characters or fewer.')
        }
        if (field === 'state' && typeof updates[field] === 'string' && updates[field].length > 100) {
          errors.push('State must be 100 characters or fewer.')
        }
        if (field === 'postalCode' && typeof updates[field] === 'string' && updates[field].length > 20) {
          errors.push('Postal code must be 20 characters or fewer.')
        }
        if (field === 'postalCode' && typeof updates[field] === 'string' && updates[field] && !/^\d{6}$/.test(updates[field])) {
          errors.push('Postal code must be a valid 6-digit Indian PIN code.')
        }
        if (field === 'latitude' && updates[field] !== null && updates[field] !== undefined) {
          const lat = Number(updates[field])
          if (isNaN(lat) || lat < -90 || lat > 90) {
            errors.push('Latitude must be a number between -90 and 90.')
          } else {
            updates[field] = lat
          }
        }
        if (field === 'longitude' && updates[field] !== null && updates[field] !== undefined) {
          const lng = Number(updates[field])
          if (isNaN(lng) || lng < -180 || lng > 180) {
            errors.push('Longitude must be a number between -180 and 180.')
          } else {
            updates[field] = lng
          }
        }
        // Phase 23 — schema.sql's own CHECK constraints already enforce
        // opening_hour 0-23 / closing_hour 1-24 at the database level; these
        // mirror that here so a bad value gets a clear message instead of a
        // raw constraint-violation error. Null clears the override (falls
        // back to the platform-wide default — domain/booking/policy.js),
        // matching resolveGroundHours' own per-field ?? fallback.
        if (field === 'openingHour' && updates[field] !== null && updates[field] !== undefined) {
          const hour = Number(updates[field])
          if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
            errors.push('Opening hour must be a whole number between 0 and 23.')
          } else {
            updates[field] = hour
          }
        }
        if (field === 'closingHour' && updates[field] !== null && updates[field] !== undefined) {
          const hour = Number(updates[field])
          if (!Number.isInteger(hour) || hour < 1 || hour > 24) {
            errors.push('Closing hour must be a whole number between 1 and 24.')
          } else {
            updates[field] = hour
          }
        }
      }
    }

    // Cross-field check only when BOTH are being set to a real value in
    // this request — resolveGroundHours supports either being set alone
    // (falls back to the platform default independently per field), so a
    // request that only touches one of the two is never blocked here.
    if (
      typeof updates.openingHour === 'number' &&
      typeof updates.closingHour === 'number' &&
      updates.closingHour <= updates.openingHour
    ) {
      errors.push('Closing hour must be later than opening hour.')
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0] })
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update.' })
    }

    const updated = await updateGroundProfileModel(req.ground.id, updates)
    if (!updated) {
      throw new Error('Failed to update ground profile.')
    }

    const formatted = {
      ...updated,
      addressLine: updated.address_line,
      postalCode: updated.postal_code,
      latitude: updated.latitude !== null && updated.latitude !== undefined ? Number(updated.latitude) : null,
      longitude: updated.longitude !== null && updated.longitude !== undefined ? Number(updated.longitude) : null,
      openingHour: updated.opening_hour !== null && updated.opening_hour !== undefined ? Number(updated.opening_hour) : null,
      closingHour: updated.closing_hour !== null && updated.closing_hour !== undefined ? Number(updated.closing_hour) : null,
    }
    delete formatted.address_line
    delete formatted.postal_code
    delete formatted.opening_hour
    delete formatted.closing_hour

    res.json({ ground: formatted })
  } catch (err) {
    next(err)
  }
}

// req.ground is resolved + authorized by requireGroundRole('GROUND_OWNER')
// before this ever runs — req.params.publicGroundId is only ever used to
// look up WHICH ground was requested, never trusted for the authorization
// decision itself.
export async function listGroundMatches(req, res, next) {
  try {
    const matches = await groundOwnerService.listGroundMatches(req.ground)
    res.json({ matches })
  } catch (err) {
    next(err)
  }
}

export async function createGroundMatch(req, res, next) {
  try {
    const { teamAId, teamBId, matchDate, requiredUmpires, oversPerInnings, ballsPerOver } = req.body
    const match = await groundOwnerService.createGroundMatch(req.ground, {
      teamAId: Number(teamAId),
      teamBId: Number(teamBId),
      matchDate,
      requiredUmpires: requiredUmpires != null ? Number(requiredUmpires) : 0,
      oversPerInnings: oversPerInnings != null ? Number(oversPerInnings) : null,
      ballsPerOver: ballsPerOver != null ? Number(ballsPerOver) : undefined,
    })
    res.status(201).json({ match })
  } catch (err) {
    next(err)
  }
}

// req.ground is authorized+resolved; req.params.matchId is only ever used
// to look up WHICH match, never trusted for the ownership decision itself —
// groundOwnerService.resolveOwnedMatch (internal) re-verifies match.ground_id
// on every one of these three actions.
export async function getGroundMatchUmpireSlots(req, res, next) {
  try {
    const { slots, umpireFee } = await groundOwnerService.getMatchUmpireSlots(req.ground, Number(req.params.matchId))
    res.json({ slots, umpireFee })
  } catch (err) {
    next(err)
  }
}

export async function getUmpireOperationsSummary(req, res, next) {
  try {
    const summary = await groundOwnerService.getUmpireOperationsSummary(req.ground)
    res.json({ summary })
  } catch (err) {
    next(err)
  }
}

export async function getRecommendedUmpires(req, res, next) {
  try {
    const candidates = await recommendUmpiresForMatch(req.ground, Number(req.params.matchId), {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    })
    res.json({ candidates })
  } catch (err) {
    next(err)
  }
}

export async function setGroundMatchUmpireFee(req, res, next) {
  try {
    const match = await groundOwnerService.setMatchUmpireFee(req.ground, Number(req.params.matchId), req.user.id, {
      amount: req.body?.amount,
      currency: req.body?.currency,
    })
    res.json({ match })
  } catch (err) {
    next(err)
  }
}

export async function updateGroundMatchSlotPaymentStatus(req, res, next) {
  try {
    const earning = await groundOwnerService.updateSlotPaymentStatus(
      req.ground,
      Number(req.params.matchId),
      Number(req.params.slotId),
      req.body?.status,
    )
    res.json({ earning })
  } catch (err) {
    next(err)
  }
}

export async function startGroundMatch(req, res, next) {
  try {
    const match = await groundOwnerService.startGroundMatch(req.ground, Number(req.params.matchId), {
      confirmUnderstaffed: req.body?.confirmUnderstaffed === true,
    })
    res.json({ match })
    // Phase 4 (Umpire Module) — this ground-owner-initiated start reuses
    // match.service.js#startMatch directly (bypassing match.controller.js's
    // own startMatch handler, which already does this for the umpire-
    // initiated path), so it needs its own publish — a spectator sitting on
    // the match page otherwise never learns upcoming -> live happened until
    // their next poll/reconnect.
    publishMatchState(req.io, match.id, 'lifecycle')
  } catch (err) {
    next(err)
  }
}

export async function completeGroundMatch(req, res, next) {
  try {
    const { match, transitioned } = await groundOwnerService.completeGroundMatch(req.ground, Number(req.params.matchId))
    res.json({ match })
    // Same reasoning as startGroundMatch above — only on a real transition,
    // mirroring the notification's own no-op-branch guard right next to it.
    if (transitioned) publishMatchState(req.io, match.id, 'lifecycle')
  } catch (err) {
    next(err)
  }
}

export async function cancelGroundMatch(req, res, next) {
  try {
    const { match, transitioned } = await groundOwnerService.cancelGroundMatch(req.ground, Number(req.params.matchId), req.user.id, req.body?.reason)
    res.json({ match })
    // Same publish pattern as start/complete above — a spectator/other
    // umpires' clients sitting on this match need to learn it's gone.
    if (transitioned) publishMatchState(req.io, match.id, 'lifecycle')
  } catch (err) {
    next(err)
  }
}

export async function markUmpireNoShow(req, res, next) {
  try {
    const slot = await groundOwnerService.markMatchUmpireNoShow(req.ground, Number(req.params.matchId), Number(req.params.slotId), req.user.id)
    res.json({ slot })
  } catch (err) {
    next(err)
  }
}

export async function getEligibleReplacements(req, res, next) {
  try {
    const candidates = await groundOwnerService.listEligibleReplacements(req.ground, Number(req.params.matchId), Number(req.params.slotId))
    res.json({ candidates })
  } catch (err) {
    next(err)
  }
}

export async function assignReplacementUmpire(req, res, next) {
  try {
    const newUmpireUserId = Number(req.body?.newUmpireUserId)
    if (!Number.isInteger(newUmpireUserId)) return res.status(400).json({ error: 'newUmpireUserId is required.' })
    const slot = await groundOwnerService.assignReplacementUmpire(
      req.ground,
      Number(req.params.matchId),
      Number(req.params.slotId),
      newUmpireUserId,
      req.user.id,
    )
    res.json({ slot })
  } catch (err) {
    next(err)
  }
}

export async function getMatchAssignmentHistory(req, res, next) {
  try {
    const events = await groundOwnerService.getMatchAssignmentHistory(req.ground, Number(req.params.matchId))
    res.json({ events })
  } catch (err) {
    next(err)
  }
}

export async function getMatchIncidents(req, res, next) {
  try {
    const incidents = await groundOwnerService.getMatchIncidents(req.ground, Number(req.params.matchId))
    res.json({ incidents })
  } catch (err) {
    next(err)
  }
}

// Phase 4 — ground-scoped Staff (GROUND_ADMIN/CANTEEN_STAFF), distinct from
// the platform-wide staff.controller.js. req.ground is already resolved +
// ownership-verified by requireGroundRole('GROUND_OWNER'); req.user.id is
// only ever used as the audit log's actor, never trusted for authorization.
export async function createGroundStaff(req, res, next) {
  try {
    const { name, identifier, role } = req.body || {}
    const { user, membership } = await createStaffForGround(req.ground, { name, identifier, role }, req.user.id)
    res.status(201).json({ user, membership })
  } catch (err) {
    next(err)
  }
}

export async function listGroundStaff(req, res, next) {
  try {
    const staff = await listStaffForGround(req.ground)
    res.json({ staff })
  } catch (err) {
    next(err)
  }
}

// Phase 5 — granular Staff permissions. req.ground is resolved by
// requireGroundRole('GROUND_OWNER') (routes.js) — these four actions are
// never reachable via requireGroundPermission, so a staff member can never
// call them regardless of what they've been granted.
export async function getPermissionCatalog(req, res, next) {
  try {
    const permissions = await listPermissionCatalog()
    res.json({ permissions })
  } catch (err) {
    next(err)
  }
}

export async function grantStaffPermissionHandler(req, res, next) {
  try {
    await grantStaffPermission(req.ground, Number(req.params.membershipId), req.body?.permissionKey, req.user.id, req.session?.id)
    res.status(201).json({ granted: true })
  } catch (err) {
    next(err)
  }
}

export async function revokeStaffPermissionHandler(req, res, next) {
  try {
    await revokeStaffPermission(req.ground, Number(req.params.membershipId), req.params.permissionKey, req.user.id)
    res.json({ revoked: true })
  } catch (err) {
    next(err)
  }
}

export async function disableStaffMembershipHandler(req, res, next) {
  try {
    await disableStaffMembership(req.ground, Number(req.params.membershipId), req.user.id, req.session?.id, req.io)
    res.json({ disabled: true })
  } catch (err) {
    next(err)
  }
}

// Phase 9 — Ground Owner Operations Dashboard. Read-only view of today's and
// upcoming activities for a specific ground. Reuses staff dashboard logic
// (groundDashboard.service) adapted for owner perspective.
export async function getGroundDashboard(req, res, next) {
  try {
    const dashboard = await groundOwnerService.getGroundOwnerDashboard(req.ground.id)
    // Phase 15 — best-effort, on-demand low-stock/menu-not-published check
    // (see groundNotification.service.js#checkOperationalAlerts's own
    // comment for why this runs here rather than a new scheduler). Never
    // throws, so it can never turn a successful dashboard load into an error.
    await notificationService.checkOperationalAlerts(req.ground.id, req.io)
    res.json(dashboard)
  } catch (err) {
    next(err)
  }
}

// Phase 11 audit — Phase 10's analytics service existed but was never wired
// to a reachable endpoint (a "broken flow" per the Phase 11 audit brief:
// Analytics was unreachable from the Ground Owner journey). `range` is
// validated against a fixed allow-list, never passed through to the service/
// SQL as free-form client input. req.ground is resolved+authorized by
// requireGroundRole('GROUND_OWNER') exactly like every other route in this file.
const ALLOWED_ANALYTICS_RANGES = ['TODAY', 'LAST_7_DAYS', 'LAST_30_DAYS']

export async function getGroundAnalytics(req, res, next) {
  try {
    const range = ALLOWED_ANALYTICS_RANGES.includes(req.query.range) ? req.query.range : 'TODAY'
    // Phase 14 — now returns booking metrics (unchanged shape) plus
    // utilization + canteenRevenue; getFullAnalytics composes all three.
    const analytics = await groundOwnerAnalyticsService.getFullAnalytics(req.ground.id, range)
    res.json(analytics)
  } catch (err) {
    next(err)
  }
}

// Phase 14 — CSV export. Reuses getFullAnalytics verbatim (same service,
// same ground scope, same aggregation — never a second, divergent
// calculation of the same numbers) and only differs in serialization.
// A cell is quoted whenever it needs to be (comma/quote/newline) AND any
// value that could be interpreted as a spreadsheet formula (leading
// =/+/-/@) is neutralized with a leading apostrophe — CSV formula-injection
// protection, since this file is opened directly in Excel/Sheets by a real
// owner. Every value here is either a fixed label this file defines or a
// number this service computed — no free-form user text (reviewer
// comments, customer names) is ever included.
function csvCell(value) {
  const str = String(value)
  const needsFormulaGuard = /^[=+\-@]/.test(str)
  const guarded = needsFormulaGuard ? `'${str}` : str
  const needsQuoting = /[",\n\r]/.test(guarded)
  return needsQuoting ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

function buildAnalyticsCsv(analytics) {
  const rows = [
    ['Metric', 'Value'],
    ['Date Range', analytics.dateRange],
    ['Total Bookings', analytics.metrics.totalBookings],
    ['Confirmed Bookings', analytics.metrics.confirmedBookings],
    ['Cancelled Bookings', analytics.metrics.cancelledBookings],
    ['No-Show Bookings', analytics.metrics.noShowBookings],
    ['Total Booked Hours', analytics.metrics.totalBookedHours],
    ['Average Booking Hours', analytics.metrics.averageBookingHours],
    ['Utilization %', analytics.utilization.utilizedPercentage != null ? analytics.utilization.utilizedPercentage.toFixed(1) : ''],
    ['Booked Hours', analytics.utilization.bookedHours],
    ['Blocked Hours', analytics.utilization.blockedHours],
    ['Match Hours', analytics.utilization.matchHours],
    ['Free Hours', analytics.utilization.freeHours],
    ['Total Available Hours', analytics.utilization.totalHours],
    ['Canteen Revenue', analytics.canteenRevenue.revenue],
    ['Canteen Order Count', analytics.canteenRevenue.orderCount],
    ['Average Order Value', analytics.canteenRevenue.averageOrderValue],
  ]
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export async function exportGroundAnalyticsCsv(req, res, next) {
  try {
    const range = ALLOWED_ANALYTICS_RANGES.includes(req.query.range) ? req.query.range : 'TODAY'
    const analytics = await groundOwnerAnalyticsService.getFullAnalytics(req.ground.id, range)
    const csv = buildAnalyticsCsv(analytics)

    res.set('Content-Type', 'text/csv; charset=utf-8')
    res.set('Content-Disposition', `attachment; filename="ground-analytics-${range.toLowerCase()}.csv"`)
    res.send(csv)
  } catch (err) {
    next(err)
  }
}

// Phase 16 — day-by-day trend series, a sibling of /analytics (not merged
// into it — a series is a different response shape than a snapshot, and
// keeping them separate means a caller that only needs the snapshot never
// pays for the trend queries).
export async function getGroundTrends(req, res, next) {
  try {
    const range = ALLOWED_ANALYTICS_RANGES.includes(req.query.range) ? req.query.range : 'TODAY'
    const trends = await groundOwnerAnalyticsService.getTrends(req.ground.id, range)
    res.json(trends)
  } catch (err) {
    next(err)
  }
}

// Phase 13 — Ground Owner Reviews. req.ground is resolved+authorized by
// requireGroundRole('GROUND_OWNER') before this ever runs; req.params.publicGroundId
// is only ever used to look up WHICH ground, never trusted for authorization.
// page/limit are plain client input clamped entirely inside the service —
// never trusted for SQL LIMIT/OFFSET without that clamp.
export async function getGroundReviews(req, res, next) {
  try {
    const result = await groundOwnerReviewsService.getGroundReviews(req.ground.id, {
      page: req.query.page,
      limit: req.query.limit,
    })
    res.json(result)
  } catch (err) {
    next(err)
  }
}

// Phase 15 — Ground Owner Notifications, ground-scoped. Same posture as
// Reviews/Dashboard/Analytics above — req.ground.id (server-resolved,
// never client-supplied) and req.user.id together are the only scope any
// query here ever uses; a notification's ground_id/user_id must BOTH match
// (see groundNotification.repository.js#listForGround's own comment).
const MAX_NOTIFICATIONS_LIMIT = 50

export async function getGroundNotifications(req, res, next) {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, MAX_NOTIFICATIONS_LIMIT))
    const offset = Math.max(0, Number(req.query.offset) || 0)
    const result = await notificationService.listGroundNotifications(req.user.id, req.ground.id, { limit, offset })
    res.json(result)
  } catch (err) {
    next(err)
  }
}

// markRead is user_id-scoped exactly like the existing global GET
// /ground/notifications endpoint (its own WHERE clause already requires
// id AND user_id to match — Owner A can never mark Owner B's notification
// read merely by guessing/enumerating its id). Reused verbatim — marking
// ONE specific notification read can't leak across grounds since the id
// itself already pins it to one row.
export async function markGroundNotificationRead(req, res, next) {
  try {
    const notification = await notificationService.markRead(Number(req.params.id), req.user.id)
    res.json({ notification })
  } catch (err) {
    next(err)
  }
}

// "Mark all read" is NOT reused from the global endpoint — see
// markAllReadForGround's own comment: it must only affect req.ground.id,
// never every ground this owner has.
export async function markAllGroundNotificationsRead(req, res, next) {
  try {
    await notificationService.markAllReadForGround(req.user.id, req.ground.id)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}
