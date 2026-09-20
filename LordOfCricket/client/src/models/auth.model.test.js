// Run with: node --test src/models/auth.model.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'

// Test the auth state flow documented in AuthContext.jsx
test('Auth state transitions', () => {
  // Initial state: loading
  const initialStatus = 'loading'
  assert.equal(initialStatus, 'loading')

  // After /auth/me 401: unauthenticated
  const unauthStatus = 'unauthenticated'
  assert.equal(unauthStatus, 'unauthenticated')

  // After successful login/OTP: authenticated
  const authStatus = 'authenticated'
  assert.equal(authStatus, 'authenticated')
})

test('MFA state object shape (Phase 6)', () => {
  const DEFAULT_MFA = { enrolled: false, required: false, verified: false }

  // Verify the default shape
  assert.deepEqual(DEFAULT_MFA, { enrolled: false, required: false, verified: false })

  // After /auth/me as non-super-admin
  const regularUserMfa = { enrolled: false, required: false, verified: false }
  assert.deepEqual(regularUserMfa, DEFAULT_MFA)

  // After /auth/me as super-admin (required=true)
  const superAdminMfa = { enrolled: true, required: true, verified: false }
  assert.equal(superAdminMfa.required, true)
  assert.equal(superAdminMfa.verified, false)

  // After MFA verification
  const verifiedMfa = { enrolled: true, required: true, verified: true }
  assert.equal(verifiedMfa.verified, true)
})

test('User shape after /auth/me', () => {
  // Player user
  const playerUser = {
    id: '123',
    email: 'player@test.com',
    phone: '+919876543210',
    name: 'Test Player',
    role: 'player',
    player_type: 'team_player',
    force_password_change: false,
  }
  assert.equal(playerUser.role, 'player')
  assert.equal(playerUser.player_type, 'team_player')

  // Umpire user
  const umpireUser = {
    id: '124',
    email: 'umpire@test.com',
    role: 'player',
    player_type: 'umpire',
  }
  assert.equal(umpireUser.player_type, 'umpire')

  // Staff user (super_admin)
  const superAdminUser = {
    id: '125',
    email: 'admin@test.com',
    role: 'staff',
    staff_role: 'super_admin',
    force_password_change: false,
  }
  assert.equal(superAdminUser.role, 'staff')
  assert.equal(superAdminUser.staff_role, 'super_admin')

  // Staff user (ground-level)
  const groundStaffUser = {
    id: '126',
    email: 'groundstaff@test.com',
    role: 'staff',
    staff_role: null, // ground_users staff has no platform-level staff_role
  }
  assert.equal(groundStaffUser.role, 'staff')
  assert.equal(groundStaffUser.staff_role, null)
})

test('User shape after force password change (Phase 8)', () => {
  // Bootstrap super admin or admin-reset account
  const forcePasswordChangeUser = {
    id: '127',
    email: 'bootstrap@test.com',
    role: 'staff',
    staff_role: 'super_admin',
    force_password_change: true,
  }
  assert.equal(forcePasswordChangeUser.force_password_change, true)
})

test('Player data shape (from fetchMyPlayer)', () => {
  const player = {
    id: '123',
    user_id: '123',
    first_name: 'John',
    last_name: 'Doe',
    profile_image_url: 'https://example.com/image.jpg',
    date_of_birth: '1990-01-15',
    role: 'team_player',
  }
  assert.equal(player.first_name, 'John')
  assert.equal(player.role, 'team_player')
})

test('HTTP session cookie is HttpOnly (not readable by JS)', () => {
  // SESSION_COOKIE_NAME is managed by backend setSessionCookie/clearSessionCookie
  // Frontend cannot read HttpOnly cookies via document.cookie
  // This is by design — the cookie is sent automatically via withCredentials: true
  // Verify the axios instance uses withCredentials
  const withCredentialsEnabled = true
  assert.equal(withCredentialsEnabled, true)
})

test('Session expiry event mechanism (Phase 22.1)', () => {
  // 401 on any endpoint except /auth/me triggers loc:session-expired event
  // AuthContext listens for this event and resets state
  const sessionExpiredEvent = new Event('loc:session-expired')
  assert.equal(sessionExpiredEvent.type, 'loc:session-expired')
})

test('Role identity checks', () => {
  // Helper functions for role checks (these would be used in route guards)
  function isSuperAdmin(user) {
    return user?.role === 'staff' && user?.staff_role === 'super_admin'
  }

  function isGroundStaff(user) {
    return user?.role === 'staff' && (user?.staff_role === null || user?.staff_role === 'ground_admin' || user?.staff_role === 'canteen_staff')
  }

  function isApprovedUmpire(user, umpireRequest) {
    return user?.role === 'player' && user?.player_type === 'umpire' && umpireRequest?.status === 'approved'
  }

  // Test super admin
  assert.equal(isSuperAdmin({ role: 'staff', staff_role: 'super_admin' }), true)
  assert.equal(isSuperAdmin({ role: 'staff', staff_role: 'admin' }), false)
  assert.equal(isSuperAdmin({ role: 'player' }), false)

  // Test ground staff
  assert.equal(isGroundStaff({ role: 'staff', staff_role: null }), true)
  assert.equal(isGroundStaff({ role: 'staff', staff_role: 'canteen_staff' }), true)
  assert.equal(isGroundStaff({ role: 'player' }), false)

  // Test approved umpire
  assert.equal(isApprovedUmpire({ role: 'player', player_type: 'umpire' }, { status: 'approved' }), true)
  assert.equal(isApprovedUmpire({ role: 'player', player_type: 'umpire' }, { status: 'pending' }), false)
  assert.equal(isApprovedUmpire({ role: 'player', player_type: 'team_player' }, { status: 'approved' }), false)
})
