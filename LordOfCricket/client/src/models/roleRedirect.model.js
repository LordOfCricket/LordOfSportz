export function getPostAuthPath(user) {
  if (!user) return '/login'
  if (user.role === 'staff') {
    if (user.staff_role === 'admin' || user.staff_role === 'super_admin') return '/admin/dashboard'
    if (user.staff_role === 'canteen_staff') return '/canteen/staff'
    // staff_role null: ground-scoped staff (GROUND_ADMIN/CANTEEN_STAFF in
    // ground_users), created by groundStaff.service.js#createStaffForGround
    // — the only population that leaves staff_role unset.
    return '/staff/dashboard'
  }
  if (user.role === 'player') {
    if (!user.player_type) return '/player-type'
    if (user.player_type === 'umpire') return '/umpire'
    return '/player/dashboard'
  }
  return '/role-select'
}

// Only for "just finished authenticating/onboarding" moments
// (useAuthPage.js's post-login/signup navigate, usePlayerTypeSelect.js's
// post-setup navigate) — never for a route-guard's unauthorized-fallback or
// a persistent role dispatcher. RequireStaffRole.jsx and
// CanteenEntryRedirect.jsx still use getPostAuthPath directly for those,
// unchanged.
//
// A fully set-up account now lands on the homepage ('/', DiscoveryPage —
// see routes/AppRoutes.jsx) regardless of role, not a role-specific
// dashboard. Deliberately NOT a call to getPostAuthPath anymore (that
// function is untouched and keeps its own real dashboard destinations —
// route guards/dispatchers still need those, only the post-login moment
// doesn't). An incomplete account still goes through its required setup
// step first (role-select / player-type) before ever reaching the
// homepage — same mandatory-setup detection getPostAuthPath uses, kept
// here rather than delegated so this function's own destination for a
// complete account can differ from getPostAuthPath's without touching it.
//
// MFA is untouched by this and was never login-gated in the first place
// (see docs/AUTH.md's Phase 6 note: "MFA is enforced only at the point a
// privileged action is attempted, never at login") — a Staff/Super Admin
// account landing on the public homepage doesn't skip MFA, it just means
// the MFA prompt now surfaces the moment they navigate to an actual
// MFA-gated destination (e.g. /admin/dashboard) instead of immediately at
// login, which is the original, documented design this function's
// previous "delegate to getPostAuthPath" version had incidentally moved
// away from as a side effect of using getPostAuthPath's own
// dashboard-specific destinations.
// First-Login Player Profile Onboarding — only inserted for the actual
// Player account type (player_type === 'team_player'); an Umpire
// (player_type === 'umpire') falls straight through to '/' exactly as
// before, this form is Player-only. `player_onboarding_completed` comes
// from user.model.js's players LEFT JOIN (see PUBLIC_COLUMNS) — NULL (no
// players row yet) and false are treated identically as "not completed",
// never inferred from anything else about the account.
// SUPER_ADMIN Identity & Secure Provisioning feature — checked FIRST, ahead
// of every other post-login destination: force_password_change can be true
// for ANY role (the bootstrap Super Admin, or any account an admin reset
// via a temporary credential — see adminPasswordRecovery.service.js), so
// this can't be folded into the staff-only branches below. This is a UX
// guide only — the real enforcement for staff routes is server-side in
// requireStaffRole (middlewares/auth.js#force_password_change check);
// non-staff accounts have no privileged route to gate, so this redirect is
// the only enforcement they need.
export function getPostLoginPath(user) {
  if (!user) return '/login'
  if (user.force_password_change) return '/force-password-change'
  if (user.role === 'user') return '/role-select'
  if (user.role === 'player' && !user.player_type) return '/player-type'
  if (user.role === 'player' && user.player_type === 'team_player' && !user.player_onboarding_completed) return '/player/onboarding'
  return '/'
}
