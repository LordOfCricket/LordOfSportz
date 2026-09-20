// SUPER_ADMIN Identity & Secure Provisioning feature — real dashboard data
// (§6). The previous AdminDashboardPage.jsx called no API at all (static
// nav cards only — confirmed by inspection); every count here comes from
// an existing model function, nothing fabricated.
import { countAllGrounds, countActiveGrounds } from '../models/ground.model.js'
import { listByStatus } from '../models/groundOwnerRequest.model.js'
import { findAllGroundOwners, findAllUmpires } from '../models/user.model.js'
import { findAllPlayersForAdmin } from '../models/player.model.js'

export async function getDashboardStats(req, res, next) {
  try {
    const [totalGrounds, activeGrounds, pendingRequests, groundOwners, players, umpires] = await Promise.all([
      countAllGrounds(),
      countActiveGrounds(),
      listByStatus('PENDING'),
      findAllGroundOwners(),
      findAllPlayersForAdmin(),
      findAllUmpires(),
    ])

    res.json({
      totalGrounds,
      activeGrounds,
      pendingGroundRequests: pendingRequests.length,
      groundOwners: groundOwners.length,
      players: players.length,
      umpires: umpires.length,
      recentPendingRequests: pendingRequests.slice(0, 5).map((r) => ({
        publicRequestId: r.public_request_id,
        groundName: r.ground_name,
        applicantName: r.applicant_name,
        city: r.city,
        state: r.state,
        status: r.status,
        submittedAt: r.created_at,
      })),
    })
  } catch (err) {
    next(err)
  }
}
