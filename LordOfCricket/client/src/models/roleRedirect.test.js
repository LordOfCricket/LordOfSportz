// Run with: node --test src/models/roleRedirect.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPostAuthPath, getPostLoginPath } from './roleRedirect.model.js'

test('getPostLoginPath: no user goes to /login', () => {
  assert.equal(getPostLoginPath(null), '/login')
  assert.equal(getPostLoginPath(undefined), '/login')
})

test('getPostLoginPath: role=user (mandatory role selection not yet done) still goes to /role-select', () => {
  assert.equal(getPostLoginPath({ role: 'user' }), '/role-select')
})

// SUPER_ADMIN Identity & Secure Provisioning feature
test('getPostLoginPath: force_password_change wins over every other destination, for any role', () => {
  assert.equal(getPostLoginPath({ role: 'staff', staff_role: 'super_admin', force_password_change: true }), '/force-password-change')
  assert.equal(getPostLoginPath({ role: 'user', force_password_change: true }), '/force-password-change')
  assert.equal(getPostLoginPath({ role: 'player', player_type: null, force_password_change: true }), '/force-password-change')
})

test('getPostLoginPath: force_password_change=false or absent does not affect a staff account\'s normal destination', () => {
  assert.equal(getPostLoginPath({ role: 'staff', staff_role: 'super_admin', force_password_change: false }), '/')
  assert.equal(getPostLoginPath({ role: 'staff', staff_role: 'super_admin' }), '/')
})

test('getPostLoginPath: a player without player_type (mandatory step not yet done) still goes to /player-type', () => {
  assert.equal(getPostLoginPath({ role: 'player', player_type: null }), '/player-type')
})

// Changed back: post-login redirect lands a fully set-up account on the
// homepage regardless of role — not a role-specific dashboard, and no
// longer a delegate to getPostAuthPath (that function is untouched, still
// used directly by route guards — see the test below).
test('getPostLoginPath: a fully set-up team player with onboarding completed lands on the homepage', () => {
  assert.equal(getPostLoginPath({ role: 'player', player_type: 'team_player', player_onboarding_completed: true }), '/')
})

test('getPostLoginPath: a fully set-up approved umpire lands on the homepage, never /umpire directly', () => {
  assert.equal(getPostLoginPath({ role: 'player', player_type: 'umpire' }), '/')
})

// First-Login Player Profile Onboarding
test('getPostLoginPath: a Player whose onboarding is not completed goes to /player/onboarding', () => {
  assert.equal(getPostLoginPath({ role: 'player', player_type: 'team_player', player_onboarding_completed: false }), '/player/onboarding')
})

test('getPostLoginPath: a Player with no players row yet (player_onboarding_completed is null/undefined) also goes to /player/onboarding — never inferred as complete by default', () => {
  assert.equal(getPostLoginPath({ role: 'player', player_type: 'team_player', player_onboarding_completed: null }), '/player/onboarding')
  assert.equal(getPostLoginPath({ role: 'player', player_type: 'team_player' }), '/player/onboarding')
})

test('getPostLoginPath: an Umpire never gets Player onboarding, even with player_onboarding_completed false/missing', () => {
  assert.equal(getPostLoginPath({ role: 'player', player_type: 'umpire', player_onboarding_completed: false }), '/')
  assert.equal(getPostLoginPath({ role: 'player', player_type: 'umpire', player_onboarding_completed: null }), '/')
})

test('getPostLoginPath: staff, any sub-role including super_admin, lands on the homepage (MFA is not a login-time gate)', () => {
  assert.equal(getPostLoginPath({ role: 'staff', staff_role: 'super_admin' }), '/')
  assert.equal(getPostLoginPath({ role: 'staff', staff_role: 'admin' }), '/')
  assert.equal(getPostLoginPath({ role: 'staff', staff_role: 'canteen_staff' }), '/')
  assert.equal(getPostLoginPath({ role: 'staff', staff_role: null }), '/')
})

// getPostAuthPath itself must stay exactly as it was — RequireStaffRole.jsx's
// unauthorized-fallback and CanteenEntryRedirect.jsx's role dispatcher both
// still depend on these exact destinations.
test('getPostAuthPath is unchanged: still returns role-specific dashboards, not the homepage', () => {
  assert.equal(getPostAuthPath({ role: 'player', player_type: 'team_player' }), '/player/dashboard')
  assert.equal(getPostAuthPath({ role: 'player', player_type: 'umpire' }), '/umpire')
  assert.equal(getPostAuthPath({ role: 'staff', staff_role: 'super_admin' }), '/admin/dashboard')
  assert.equal(getPostAuthPath({ role: 'staff', staff_role: 'canteen_staff' }), '/canteen/staff')
  assert.equal(getPostAuthPath({ role: 'player', player_type: null }), '/player-type')
  assert.equal(getPostAuthPath({ role: 'user' }), '/role-select')
  assert.equal(getPostAuthPath(null), '/login')
})

// Ground-Level Staff Dashboard — a ground_users staff account (GROUND_ADMIN/
// CANTEEN_STAFF) is created with role='staff', staff_role=null. It used to
// fall into the same branch as legacy platform canteen_staff and land on
// /canteen/staff — a single-canteen dashboard unrelated to ground_users.
test('getPostAuthPath: a ground-scoped staff account (staff_role null) goes to /staff/dashboard, never /canteen/staff', () => {
  assert.equal(getPostAuthPath({ role: 'staff', staff_role: null }), '/staff/dashboard')
  assert.equal(getPostAuthPath({ role: 'staff' }), '/staff/dashboard')
})
