import { listMyStaffMemberships } from '../services/groundStaffSelf.service.js'

export async function getMyGroundStaffMemberships(req, res, next) {
  try {
    const memberships = await listMyStaffMemberships(req.user.id)
    res.json({ memberships })
  } catch (err) {
    next(err)
  }
}
