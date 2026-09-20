// Run with: node --test src/models/navLinks.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isUmpireMode, getUmpireAccountLinks, getAccountLinks, getPrimaryNavLinks, UMPIRE_PRIMARY_NAV_LINKS } from './navLinks.model.js'

// Mirrors the real player-facing set in components/home/Navbar.jsx (the one
// production-active Navbar — components/layout/Navbar.jsx has zero
// importers anywhere in the app and is intentionally left untouched).
const PLAYER_NAV_LINKS = [
  { label: 'Home', to: '/', end: true },
  { label: 'Grounds', to: '/grounds' },
  { label: 'Matches', to: '/matches' },
  { label: 'Players', to: '/players' },
  { label: 'Teams', to: '/teams' },
  { label: 'Tournaments', to: '/tournaments' },
]

test('isUmpireMode is true only for an approved-shaped player+umpire user', () => {
  assert.equal(isUmpireMode({ role: 'player', player_type: 'umpire' }), true)
})

test('isUmpireMode is false for a regular team player', () => {
  assert.equal(isUmpireMode({ role: 'player', player_type: 'team_player' }), false)
})

test('isUmpireMode is false for staff, even a super_admin scorer', () => {
  assert.equal(isUmpireMode({ role: 'staff', staff_role: 'super_admin', player_type: null }), false)
})

test('isUmpireMode is false for a pending umpire whose player_type has not been set to umpire yet, and for null/undefined user', () => {
  assert.equal(isUmpireMode({ role: 'player', player_type: null }), false)
  assert.equal(isUmpireMode(null), false)
  assert.equal(isUmpireMode(undefined), false)
})

test('getUmpireAccountLinks returns exactly the 7-item umpire workspace menu, in order', () => {
  const links = getUmpireAccountLinks()
  assert.deepEqual(
    links.map((l) => ({ label: l.label, to: l.to })),
    [
      { label: 'View Dashboard', to: '/umpire/dashboard' },
      { label: 'My Profile', to: '/umpire/profile' },
      { label: 'Grounds for Umpire', to: '/umpire/find-matches' },
      { label: 'My Matches', to: '/umpire/my-assignments' },
      { label: 'My Statistics', to: '/umpire/statistics' },
      { label: 'My Earnings', to: '/umpire/earnings' },
      { label: 'Proposals', to: '/umpire/proposals' },
    ],
  )
  assert.ok(links.every((l) => typeof l.icon === 'function' || typeof l.icon === 'object'), 'every entry carries a real icon component')
})

test('getUmpireAccountLinks never includes player-only or staff-only destinations', () => {
  const links = getUmpireAccountLinks()
  const forbidden = ['/player/dashboard', '/players', '/leaderboards', '/canteen', '/bookings', '/profile/edit', '/admin/dashboard']
  for (const link of links) {
    assert.ok(!forbidden.includes(link.to), `umpire menu must not include ${link.to}`)
  }
})

test('getAccountLinks (player path) is unaffected by the new umpire branch', () => {
  const links = getAccountLinks({ role: 'player', player_type: 'team_player' })
  assert.ok(links.some((l) => l.to === '/player/dashboard'))
  assert.ok(!links.some((l) => l.to === '/umpire/find-matches'), 'the player menu never gets the new umpire-only destinations')
})

// --- Primary Navbar (components/home/Navbar.jsx) ---------------------------

test('getPrimaryNavLinks: an approved umpire\'s primary nav is exactly "Grounds for Umpire" -> /umpire/find-matches', () => {
  const links = getPrimaryNavLinks({ role: 'player', player_type: 'umpire' }, PLAYER_NAV_LINKS)
  assert.deepEqual(links.map((l) => ({ label: l.label, to: l.to })), [{ label: 'Grounds for Umpire', to: '/umpire/find-matches' }])
})

test('getPrimaryNavLinks: an approved umpire never sees Grounds/Matches/Players/Teams/Tournaments (or Home) in the primary nav', () => {
  const links = getPrimaryNavLinks({ role: 'player', player_type: 'umpire' }, PLAYER_NAV_LINKS)
  const forbidden = ['/grounds', '/matches', '/players', '/teams', '/tournaments', '/']
  for (const link of links) {
    assert.ok(!forbidden.includes(link.to), `umpire primary nav must not include ${link.to}`)
  }
})

test('getPrimaryNavLinks: a normal player sees the unmodified player nav, unchanged', () => {
  const links = getPrimaryNavLinks({ role: 'player', player_type: 'team_player' }, PLAYER_NAV_LINKS)
  assert.deepEqual(links, PLAYER_NAV_LINKS)
})

test('getPrimaryNavLinks: staff sees the unmodified default nav (isUmpireMode is player-only) — same shared path, no separate staff branch exists', () => {
  const links = getPrimaryNavLinks({ role: 'staff', staff_role: 'super_admin', player_type: null }, PLAYER_NAV_LINKS)
  assert.deepEqual(links, PLAYER_NAV_LINKS)
})

test('getPrimaryNavLinks: a logged-out visitor (no user) sees the unmodified default nav', () => {
  assert.deepEqual(getPrimaryNavLinks(null, PLAYER_NAV_LINKS), PLAYER_NAV_LINKS)
  assert.deepEqual(getPrimaryNavLinks(undefined, PLAYER_NAV_LINKS), PLAYER_NAV_LINKS)
})

test('getPrimaryNavLinks: a pending/rejected umpire (player_type not yet "umpire") still sees the default player nav', () => {
  const links = getPrimaryNavLinks({ role: 'player', player_type: null }, PLAYER_NAV_LINKS)
  assert.deepEqual(links, PLAYER_NAV_LINKS)
})

test('UMPIRE_PRIMARY_NAV_LINKS is the exact single-item source of truth getPrimaryNavLinks returns for umpire mode', () => {
  assert.deepEqual(UMPIRE_PRIMARY_NAV_LINKS, [{ label: 'Grounds for Umpire', to: '/umpire/find-matches' }])
})
