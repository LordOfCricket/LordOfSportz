import { Suspense, lazy } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Layout from '../components/layout/Layout.jsx'
import RequireAuth from './RequireAuth.jsx'
import RequireStaffRole from './RequireStaffRole.jsx'
import RequireApprovedUmpire from './RequireApprovedUmpire.jsx'
import RequireGroundOwner from './RequireGroundOwner.jsx'
import RequireGroundStaff from './RequireGroundStaff.jsx'
import RequireMfaVerified from './RequireMfaVerified.jsx'
import RequirePrivilegedAccount from './RequirePrivilegedAccount.jsx'
import CanteenEntryRedirect from './CanteenEntryRedirect.jsx'
import RouteErrorBoundary from './RouteErrorBoundary.jsx'
import NotFoundPage from '../pages/not-found/NotFoundPage.jsx'

// Route-based code splitting. The production build was shipping
// every page (auth, scoring, canteen, tournaments, analytics, admin...) in
// one ~870KB JS chunk regardless of which single page a visitor actually
// landed on. Each page is now its own chunk, fetched only when its route is
// visited — a build-time change only, no page's own logic is touched.
// Level 1 (LOC platform homepage, ground discovery) and Level 2
// (the reusable per-ground template) replace the old single-ground HomePage.
const DiscoveryPage = lazy(() => import('../pages/discovery/DiscoveryPage.jsx'))
const GroundsPage = lazy(() => import('../pages/grounds/GroundsPage.jsx'))
// Ground Registration feature — entry choice (New Registration vs Check
// Status) replaces the old direct-to-form landing; the wizard itself
// (Contact -> Ground Info -> Featured Photos -> Gallery -> Amenities ->
// Location -> Review & Submit) is one component/route serving both a fresh
// registration and Edit & Resubmit (mode prop), so wizard state/pre-fill
// logic exists exactly once.
const RegisterGroundEntryPage = lazy(() => import('../pages/register-ground/RegisterGroundEntryPage.jsx'))
const GroundRegistrationWizardPage = lazy(() => import('../pages/register-ground/GroundRegistrationWizardPage.jsx'))
const CheckGroundRegistrationStatusPage = lazy(() => import('../pages/register-ground/CheckGroundRegistrationStatusPage.jsx'))
const GroundRegistrationStatusPage = lazy(() => import('../pages/register-ground/GroundRegistrationStatusPage.jsx'))
const GroundHomePage = lazy(() => import('../pages/ground-homepage/GroundHomePage.jsx'))
const AdminSponsorsPage = lazy(() => import('../pages/admin-sponsors/AdminSponsorsPage.jsx'))
const AdminMerchandisePage = lazy(() => import('../pages/admin-merchandise/AdminMerchandisePage.jsx'))
const AdminMerchandiseCategoryPage = lazy(() => import('../pages/admin-merchandise/AdminMerchandiseCategoryPage.jsx'))
const AdminAmenityCatalogPage = lazy(() => import('../pages/admin-amenities/AdminAmenityCatalogPage.jsx'))
const MerchandiseCatalogPage = lazy(() => import('../pages/merchandise/MerchandiseCatalogPage.jsx'))
const MerchandiseDetailPage = lazy(() => import('../pages/merchandise/MerchandiseDetailPage.jsx'))

// Super Admin Staff Dashboard
const AdminDashboardPage = lazy(() => import('../pages/admin-dashboard/AdminDashboardPage.jsx'))
const AdminUmpireRequestsPage = lazy(() => import('../pages/admin-umpire-requests/AdminUmpireRequestsPage.jsx'))
const AdminGroundRegistrationsPage = lazy(() => import('../pages/admin-ground-registrations/AdminGroundRegistrationsPage.jsx'))
const CreateStaffPage = lazy(() => import('../pages/admin-staff/CreateStaffPage.jsx'))

// SUPER_ADMIN Identity & Secure Provisioning feature — Admin Control Center.
const AllGroundsPage = lazy(() => import('../pages/admin-all-grounds/AllGroundsPage.jsx'))
const GroundOwnersPage = lazy(() => import('../pages/admin-ground-owners/GroundOwnersPage.jsx'))
const AdminPlayersPage = lazy(() => import('../pages/admin-players/AdminPlayersPage.jsx'))
const AdminUmpiresPage = lazy(() => import('../pages/admin-umpires/AdminUmpiresPage.jsx'))
const AuditLogsPage = lazy(() => import('../pages/admin-audit-logs/AuditLogsPage.jsx'))
const AdminSettingsPage = lazy(() => import('../pages/admin-settings/AdminSettingsPage.jsx'))
const ForcePasswordChangePage = lazy(() => import('../pages/force-password-change/ForcePasswordChangePage.jsx'))

// Phase 6 — Privileged Account MFA & Step-Up Security
const SecuritySettingsPage = lazy(() => import('../pages/security/SecuritySettingsPage.jsx'))
const MfaVerifyPage = lazy(() => import('../pages/security/MfaVerifyPage.jsx'))

// Site-wide auth
const AuthPage = lazy(() => import('../pages/auth/AuthPage.jsx'))
const SignupPage = lazy(() => import('../pages/auth/SignupPage.jsx'))
const RoleSelectPage = lazy(() => import('../pages/role-select/RoleSelectPage.jsx'))
const PlayerTypeSelectPage = lazy(() => import('../pages/player-type/PlayerTypeSelectPage.jsx'))
const PlayerDashboardPage = lazy(() => import('../pages/player-dashboard/PlayerDashboardPage.jsx'))
const PlayerOnboardingPage = lazy(() => import('../pages/player-onboarding/PlayerOnboardingPage.jsx'))
const ProfilePage = lazy(() => import('../pages/profile/ProfilePage.jsx'))
const ProfileEditPage = lazy(() => import('../pages/profile/ProfileEditPage.jsx'))
const UmpireStatusPage = lazy(() => import('../pages/umpire/UmpireStatusPage.jsx'))
const UmpireDashboardPage = lazy(() => import('../pages/umpire/UmpireDashboardPage.jsx'))
const UmpireGroundDiscoveryPage = lazy(() => import('../pages/umpire/UmpireGroundDiscoveryPage.jsx'))
const MyAssignmentsPage = lazy(() => import('../pages/umpire/MyAssignmentsPage.jsx'))
const UmpireProfilePage = lazy(() => import('../pages/umpire/UmpireProfilePage.jsx'))
const UmpireStatisticsPage = lazy(() => import('../pages/umpire/UmpireStatisticsPage.jsx'))
const UmpireEarningsPage = lazy(() => import('../pages/umpire/UmpireEarningsPage.jsx'))
const MatchBriefingPage = lazy(() => import('../pages/umpire/MatchBriefingPage.jsx'))
const GroundOwnerDashboardPage = lazy(() => import('../pages/ground-owner/GroundOwnerDashboardPage.jsx'))
const GroundMatchesPage = lazy(() => import('../pages/ground-owner/GroundMatchesPage.jsx'))
const GroundOperationsPage = lazy(() => import('../pages/ground-owner/GroundOperationsPage.jsx'))
const GroundAnalyticsPage = lazy(() => import('../pages/ground-owner/GroundAnalyticsPage.jsx'))
const GroundReviewsPage = lazy(() => import('../pages/ground-owner/GroundReviewsPage.jsx'))
const GroundProfilePage = lazy(() => import('../pages/ground-owner/GroundProfilePage.jsx'))
const GroundMediaPage = lazy(() => import('../pages/ground-owner/GroundMediaPage.jsx'))
const GroundAmenitiesPage = lazy(() => import('../pages/ground-owner/GroundAmenitiesPage.jsx'))
const GroundLocationPage = lazy(() => import('../pages/ground-owner/GroundLocationPage.jsx'))
const GroundStaffPage = lazy(() => import('../pages/ground-owner/GroundStaffPage.jsx'))
const GroundBookingPage = lazy(() => import('../pages/ground-owner/GroundBookingPage.jsx'))
const GroundBookingCalendarPage = lazy(() => import('../pages/ground-owner/GroundBookingCalendarPage.jsx'))
const GroundBookingListPage = lazy(() => import('../pages/ground-owner/GroundBookingListPage.jsx'))
const GroundPricingPage = lazy(() => import('../pages/ground-owner/GroundPricingPage.jsx'))
const GroundCanteenPage = lazy(() => import('../pages/ground-owner/GroundCanteenPage.jsx'))
const GroundCanteenMenuPage = lazy(() => import('../pages/ground-owner/GroundCanteenMenuPage.jsx'))
const GroundCanteenTodayPage = lazy(() => import('../pages/ground-owner/GroundCanteenTodayPage.jsx'))
const GroundCanteenOrdersPage = lazy(() => import('../pages/ground-owner/GroundCanteenOrdersPage.jsx'))
const BrowseUmpiresPage = lazy(() => import('../pages/ground-owner/BrowseUmpiresPage.jsx'))

// Ground-Level Staff Dashboard — reuses GroundMatchesPage/GroundBookingPage*/
// GroundCanteenPage* above (already lazy-imported for the Owner routes) under
// a separate /staff/grounds/... path tree; only the dashboard itself is new.
const StaffDashboardPage = lazy(() => import('../pages/staff-dashboard/StaffDashboardPage.jsx'))
const UmpireProposalsPage = lazy(() => import('../pages/umpire/UmpireProposalsPage.jsx'))

// Real, backend-authoritative match scoring
const MatchSetupPage = lazy(() => import('../pages/match-setup/MatchSetupPage.jsx'))
const MatchRosterPage = lazy(() => import('../pages/match-setup/MatchRosterPage.jsx'))
const RealScorerPage = lazy(() => import('../pages/scorer/RealScorerPage.jsx'))

// Player discovery, public profiles, leaderboards (all public reads)
const PlayersDiscoveryPage = lazy(() => import('../pages/players/PlayersDiscoveryPage.jsx'))
const PublicPlayerProfilePage = lazy(() => import('../pages/players/PublicPlayerProfilePage.jsx'))
const LeaderboardsPage = lazy(() => import('../pages/leaderboards/LeaderboardsPage.jsx'))
const RecordsPage = lazy(() => import('../pages/leaderboards/RecordsPage.jsx'))
const TopUmpiresPage = lazy(() => import('../pages/leaderboards/TopUmpiresPage.jsx'))

// Advanced Cricket Analytics: player/team comparison (public reads)
const PlayerComparePage = lazy(() => import('../pages/players/PlayerComparePage.jsx'))
const PlayerHeadToHeadPage = lazy(() => import('../pages/players/PlayerHeadToHeadPage.jsx'))
const TeamComparePage = lazy(() => import('../pages/teams/TeamComparePage.jsx'))

// Public match summary/scorecard (public read, no auth wall)
const MatchSummaryPage = lazy(() => import('../pages/match-summary/MatchSummaryPage.jsx'))
const MatchFeedbackPage = lazy(() => import('../pages/match-feedback/MatchFeedbackPage.jsx'))

// Public match discovery (public read, no auth wall)
const MatchesPage = lazy(() => import('../pages/matches/MatchesPage.jsx'))

// Public team ecosystem (public read, no auth wall)
const TeamsPage = lazy(() => import('../pages/teams/TeamsPage.jsx'))
const TeamProfilePage = lazy(() => import('../pages/teams/TeamProfilePage.jsx'))

// Canteen (merged from the Canteen-Management repo)
const CanteenMenuPage = lazy(() => import('../pages/canteen/menu/menu.jsx'))
const CanteenOrderStatusPage = lazy(() => import('../pages/canteen/order-status/orderStatus.jsx'))
const CanteenStaffDashboardPage = lazy(() => import('../pages/canteen/staff/dashboard.jsx'))

// Ground booking
const MyBookingsPage = lazy(() => import('../pages/booking/MyBookingsPage.jsx'))
const StaffBookingPage = lazy(() => import('../pages/booking/StaffBookingPage.jsx'))

// Team booking and match proposals (Phase E)
const CreateTeamBookingPage = lazy(() => import('../pages/team-booking/CreateTeamBookingPage.jsx'))
const MyTeamBookingsPage = lazy(() => import('../pages/team-booking/MyTeamBookingsPage.jsx'))
const MatchProposalsDiscoveryPage = lazy(() => import('../pages/match-proposal/MatchProposalsDiscoveryPage.jsx'))
const MatchProposalDetailPage = lazy(() => import('../pages/match-proposal/MatchProposalDetailPage.jsx'))
const CreateMatchProposalPage = lazy(() => import('../pages/match-proposal/CreateMatchProposalPage.jsx'))

// Tournament management (public reads, staff-only mutations)
const TournamentsPage = lazy(() => import('../pages/tournaments/TournamentsPage.jsx'))
const TournamentPage = lazy(() => import('../pages/tournaments/TournamentPage.jsx'))
const CreateTournamentPage = lazy(() => import('../pages/tournaments/CreateTournamentPage.jsx'))

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading page">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
    </div>
  )
}

function withSuspense(element) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: '/', element: withSuspense(<DiscoveryPage />) },
      { path: '/grounds', element: withSuspense(<GroundsPage />) },
      // Ground Registration feature — only the entry choice itself is
      // public (both options are visible to a logged-out visitor); starting
      // or editing an actual registration requires login, matching the
      // existing POST /grounds route's own requireAuth.
      { path: '/register-ground', element: withSuspense(<RegisterGroundEntryPage />) },
      { path: '/register-ground/new', element: <RequireAuth>{withSuspense(<GroundRegistrationWizardPage mode="create" />)}</RequireAuth> },
      { path: '/register-ground/edit/:publicRequestId', element: <RequireAuth>{withSuspense(<GroundRegistrationWizardPage mode="edit" />)}</RequireAuth> },
      { path: '/register-ground/check', element: withSuspense(<CheckGroundRegistrationStatusPage />) },
      { path: '/register-ground/status/:publicRequestId', element: withSuspense(<GroundRegistrationStatusPage />) },
      { path: '/grounds/:publicGroundId', element: withSuspense(<GroundHomePage />) },
      // Merchandise — public read-only catalog + product detail (the
      // homepage MerchandiseSection's CTAs). No cart/checkout.
      { path: '/merchandise', element: withSuspense(<MerchandiseCatalogPage />) },
      { path: '/merchandise/:id', element: withSuspense(<MerchandiseDetailPage />) },
      { path: '/admin/sponsors', element: <RequireStaffRole allow={['super_admin']}><RequireMfaVerified>{withSuspense(<AdminSponsorsPage />)}</RequireMfaVerified></RequireStaffRole> },
      { path: '/admin/merchandise', element: <RequireStaffRole allow={['super_admin']}><RequireMfaVerified>{withSuspense(<AdminMerchandisePage />)}</RequireMfaVerified></RequireStaffRole> },
      { path: '/admin/merchandise/:categorySlug', element: <RequireStaffRole allow={['super_admin']}><RequireMfaVerified>{withSuspense(<AdminMerchandiseCategoryPage />)}</RequireMfaVerified></RequireStaffRole> },
      { path: '/admin/amenities', element: <RequireStaffRole allow={['super_admin']}><RequireMfaVerified>{withSuspense(<AdminAmenityCatalogPage />)}</RequireMfaVerified></RequireStaffRole> },

      // Super Admin Staff Dashboard — RequireMfaVerified is a no-op for a
      // plain 'admin' staff member (mfa.required only ever reflects
      // super_admin, see docs/MFA.md), so wrapping this shared-access route
      // is safe without splitting it.
      { path: '/admin/dashboard', element: <RequireStaffRole allow={['super_admin', 'admin']}><RequireMfaVerified>{withSuspense(<AdminDashboardPage />)}</RequireMfaVerified></RequireStaffRole> },
      { path: '/admin/umpire-requests', element: <RequireStaffRole allow={['super_admin']}><RequireMfaVerified>{withSuspense(<AdminUmpireRequestsPage />)}</RequireMfaVerified></RequireStaffRole> },
      { path: '/admin/ground-registrations', element: <RequireStaffRole allow={['super_admin']}><RequireMfaVerified>{withSuspense(<AdminGroundRegistrationsPage />)}</RequireMfaVerified></RequireStaffRole> },
      { path: '/admin/staff/new', element: <RequireStaffRole allow={['super_admin']}><RequireMfaVerified>{withSuspense(<CreateStaffPage />)}</RequireMfaVerified></RequireStaffRole> },
      { path: '/admin/all-grounds', element: <RequireStaffRole allow={['super_admin']}><RequireMfaVerified>{withSuspense(<AllGroundsPage />)}</RequireMfaVerified></RequireStaffRole> },
      { path: '/admin/ground-owners', element: <RequireStaffRole allow={['super_admin']}><RequireMfaVerified>{withSuspense(<GroundOwnersPage />)}</RequireMfaVerified></RequireStaffRole> },
      { path: '/admin/players', element: <RequireStaffRole allow={['super_admin']}><RequireMfaVerified>{withSuspense(<AdminPlayersPage />)}</RequireMfaVerified></RequireStaffRole> },
      { path: '/admin/umpires', element: <RequireStaffRole allow={['super_admin']}><RequireMfaVerified>{withSuspense(<AdminUmpiresPage />)}</RequireMfaVerified></RequireStaffRole> },
      { path: '/admin/audit-log', element: <RequireStaffRole allow={['super_admin']}><RequireMfaVerified>{withSuspense(<AuditLogsPage />)}</RequireMfaVerified></RequireStaffRole> },
      { path: '/admin/settings', element: <RequireStaffRole allow={['super_admin']}><RequireMfaVerified>{withSuspense(<AdminSettingsPage />)}</RequireMfaVerified></RequireStaffRole> },

      // Phase 6 — Security Settings + privileged-session verification.
      { path: '/security', element: <RequirePrivilegedAccount>{withSuspense(<SecuritySettingsPage />)}</RequirePrivilegedAccount> },
      { path: '/security/mfa-verify', element: <RequireAuth>{withSuspense(<MfaVerifyPage />)}</RequireAuth> },

      // Auth
      { path: '/login', element: withSuspense(<AuthPage />) },
      // SUPER_ADMIN Identity & Secure Provisioning feature — reachable by ANY
      // authenticated account with force_password_change=true (the bootstrap
      // Super Admin, or anyone an admin reset via a temp credential), not
      // staff-only. Deliberately RequireAuth only, no RequireMfaVerified —
      // this page must stay reachable even before MFA is set up.
      { path: '/force-password-change', element: <RequireAuth>{withSuspense(<ForcePasswordChangePage />)}</RequireAuth> },
      // New Signup Flow — its own dedicated route/page (not a `?mode=` of
      // /login like the old, much smaller register form was): this form is
      // genuinely bigger (name×3, account-type radio, dual email+phone
      // verification, password+confirm), and account type is now chosen
      // via radio button ON this page, not by which link the user clicked
      // on /login — one destination serves both Player and Umpire signup.
      { path: '/signup', element: withSuspense(<SignupPage />) },
      { path: '/role-select', element: <RequireAuth>{withSuspense(<RoleSelectPage />)}</RequireAuth> },
      { path: '/player-type', element: <RequireAuth>{withSuspense(<PlayerTypeSelectPage />)}</RequireAuth> },
      { path: '/player/dashboard', element: <RequireAuth>{withSuspense(<PlayerDashboardPage />)}</RequireAuth> },
      // First-Login Player Profile Onboarding — Player-only (the page itself
      // redirects an Umpire/other role to '/'); reached via
      // getPostLoginPath, not a role-select-style mandatory step guard.
      { path: '/player/onboarding', element: <RequireAuth>{withSuspense(<PlayerOnboardingPage />)}</RequireAuth> },
      { path: '/profile', element: <RequireAuth>{withSuspense(<ProfilePage />)}</RequireAuth> },
      { path: '/profile/edit', element: <RequireAuth>{withSuspense(<ProfileEditPage />)}</RequireAuth> },
      { path: '/umpire', element: <RequireAuth>{withSuspense(<UmpireStatusPage />)}</RequireAuth> },
      { path: '/umpire/dashboard', element: <RequireApprovedUmpire>{withSuspense(<UmpireDashboardPage />)}</RequireApprovedUmpire> },
      { path: '/umpire/find-matches', element: <RequireApprovedUmpire>{withSuspense(<UmpireGroundDiscoveryPage />)}</RequireApprovedUmpire> },
      { path: '/umpire/my-assignments', element: <RequireApprovedUmpire>{withSuspense(<MyAssignmentsPage />)}</RequireApprovedUmpire> },
      { path: '/umpire/profile', element: <RequireApprovedUmpire>{withSuspense(<UmpireProfilePage />)}</RequireApprovedUmpire> },
      { path: '/umpire/statistics', element: <RequireApprovedUmpire>{withSuspense(<UmpireStatisticsPage />)}</RequireApprovedUmpire> },
      { path: '/umpire/earnings', element: <RequireApprovedUmpire>{withSuspense(<UmpireEarningsPage />)}</RequireApprovedUmpire> },
      { path: '/umpire/matches/:matchId/briefing', element: <RequireApprovedUmpire>{withSuspense(<MatchBriefingPage />)}</RequireApprovedUmpire> },
      { path: '/umpire/proposals', element: <RequireApprovedUmpire>{withSuspense(<UmpireProposalsPage />)}</RequireApprovedUmpire> },
      // `force` — RequireGroundOwner already made its own live fetchMyGrounds()
      // call and confirmed real ownership before rendering children at all,
      // so RequireMfaVerified treats MFA as required here without
      // re-deriving ownership a second time (mfa.required from /auth/me only
      // ever reflects Super Admin — see docs/MFA.md).
      { path: '/ground-owner/dashboard', element: <RequireGroundOwner><RequireMfaVerified force>{withSuspense(<GroundOwnerDashboardPage />)}</RequireMfaVerified></RequireGroundOwner> },
      { path: '/ground-owner/browse-umpires', element: <RequireGroundOwner><RequireMfaVerified force>{withSuspense(<BrowseUmpiresPage />)}</RequireMfaVerified></RequireGroundOwner> },
      { path: '/ground-owner/grounds/:publicGroundId', element: <RequireGroundOwner><RequireMfaVerified force>{withSuspense(<GroundMatchesPage />)}</RequireMfaVerified></RequireGroundOwner> },
      { path: '/ground-owner/grounds/:publicGroundId/operations', element: <RequireGroundOwner><RequireMfaVerified force>{withSuspense(<GroundOperationsPage />)}</RequireMfaVerified></RequireGroundOwner> },
      { path: '/ground-owner/grounds/:publicGroundId/analytics', element: <RequireGroundOwner><RequireMfaVerified force>{withSuspense(<GroundAnalyticsPage />)}</RequireMfaVerified></RequireGroundOwner> },
      { path: '/ground-owner/grounds/:publicGroundId/reviews', element: <RequireGroundOwner><RequireMfaVerified force>{withSuspense(<GroundReviewsPage />)}</RequireMfaVerified></RequireGroundOwner> },
      { path: '/ground-owner/grounds/:publicGroundId/profile', element: <RequireGroundOwner><RequireMfaVerified force>{withSuspense(<GroundProfilePage />)}</RequireMfaVerified></RequireGroundOwner> },
      { path: '/ground-owner/grounds/:publicGroundId/media', element: <RequireGroundOwner><RequireMfaVerified force>{withSuspense(<GroundMediaPage />)}</RequireMfaVerified></RequireGroundOwner> },
      { path: '/ground-owner/grounds/:publicGroundId/amenities', element: <RequireGroundOwner><RequireMfaVerified force>{withSuspense(<GroundAmenitiesPage />)}</RequireMfaVerified></RequireGroundOwner> },
      { path: '/ground-owner/grounds/:publicGroundId/location', element: <RequireGroundOwner><RequireMfaVerified force>{withSuspense(<GroundLocationPage />)}</RequireMfaVerified></RequireGroundOwner> },
      { path: '/ground-owner/grounds/:publicGroundId/staff', element: <RequireGroundOwner><RequireMfaVerified force>{withSuspense(<GroundStaffPage />)}</RequireMfaVerified></RequireGroundOwner> },
      { path: '/ground-owner/grounds/:publicGroundId/bookings', element: <RequireGroundOwner><RequireMfaVerified force>{withSuspense(<GroundBookingPage />)}</RequireMfaVerified></RequireGroundOwner> },
      { path: '/ground-owner/grounds/:publicGroundId/bookings/calendar', element: <RequireGroundOwner><RequireMfaVerified force>{withSuspense(<GroundBookingCalendarPage />)}</RequireMfaVerified></RequireGroundOwner> },
      { path: '/ground-owner/grounds/:publicGroundId/bookings/list', element: <RequireGroundOwner><RequireMfaVerified force>{withSuspense(<GroundBookingListPage />)}</RequireMfaVerified></RequireGroundOwner> },
      { path: '/ground-owner/grounds/:publicGroundId/pricing', element: <RequireGroundOwner><RequireMfaVerified force>{withSuspense(<GroundPricingPage />)}</RequireMfaVerified></RequireGroundOwner> },
      { path: '/ground-owner/grounds/:publicGroundId/canteen', element: <RequireGroundOwner><RequireMfaVerified force>{withSuspense(<GroundCanteenPage />)}</RequireMfaVerified></RequireGroundOwner> },
      { path: '/ground-owner/grounds/:publicGroundId/canteen/menu', element: <RequireGroundOwner><RequireMfaVerified force>{withSuspense(<GroundCanteenMenuPage />)}</RequireMfaVerified></RequireGroundOwner> },
      { path: '/ground-owner/grounds/:publicGroundId/canteen/today', element: <RequireGroundOwner><RequireMfaVerified force>{withSuspense(<GroundCanteenTodayPage />)}</RequireMfaVerified></RequireGroundOwner> },
      { path: '/ground-owner/grounds/:publicGroundId/canteen/orders', element: <RequireGroundOwner><RequireMfaVerified force>{withSuspense(<GroundCanteenOrdersPage />)}</RequireMfaVerified></RequireGroundOwner> },

      // Ground-Level Staff Dashboard — reuses the same Matches/Bookings/Canteen
      // page components as the Owner routes above (GroundNavTabs/
      // GroundOwnerLayout self-detect the /staff/ prefix and adjust nav/back-
      // links accordingly, see those files). No RequireMfaVerified: MFA is
      // never mandatory for GROUND_ADMIN/CANTEEN_STAFF (groundAccess.js),
      // matching the backend exactly. Matches has no /matches suffix to match
      // GroundNavTabs' own generated href (tab.path is '' for Matches).
      { path: '/staff/dashboard', element: <RequireGroundStaff>{withSuspense(<StaffDashboardPage />)}</RequireGroundStaff> },
      { path: '/staff/grounds/:publicGroundId', element: <RequireGroundStaff>{withSuspense(<GroundMatchesPage />)}</RequireGroundStaff> },
      { path: '/staff/grounds/:publicGroundId/bookings', element: <RequireGroundStaff>{withSuspense(<GroundBookingPage />)}</RequireGroundStaff> },
      { path: '/staff/grounds/:publicGroundId/bookings/calendar', element: <RequireGroundStaff>{withSuspense(<GroundBookingCalendarPage />)}</RequireGroundStaff> },
      { path: '/staff/grounds/:publicGroundId/bookings/list', element: <RequireGroundStaff>{withSuspense(<GroundBookingListPage />)}</RequireGroundStaff> },
      { path: '/staff/grounds/:publicGroundId/pricing', element: <RequireGroundStaff>{withSuspense(<GroundPricingPage />)}</RequireGroundStaff> },
      { path: '/staff/grounds/:publicGroundId/canteen', element: <RequireGroundStaff>{withSuspense(<GroundCanteenPage />)}</RequireGroundStaff> },
      { path: '/staff/grounds/:publicGroundId/canteen/menu', element: <RequireGroundStaff>{withSuspense(<GroundCanteenMenuPage />)}</RequireGroundStaff> },
      { path: '/staff/grounds/:publicGroundId/canteen/today', element: <RequireGroundStaff>{withSuspense(<GroundCanteenTodayPage />)}</RequireGroundStaff> },
      { path: '/staff/grounds/:publicGroundId/canteen/orders', element: <RequireGroundStaff>{withSuspense(<GroundCanteenOrdersPage />)}</RequireGroundStaff> },

      // Player discovery, public profiles, leaderboards (public reads, no auth wall)
      { path: '/players', element: withSuspense(<PlayersDiscoveryPage />) },
      { path: '/players/compare', element: withSuspense(<PlayerComparePage />) },
      { path: '/players/head-to-head', element: withSuspense(<PlayerHeadToHeadPage />) },
      { path: '/players/:publicPlayerId', element: withSuspense(<PublicPlayerProfilePage />) },
      { path: '/leaderboards', element: withSuspense(<LeaderboardsPage />) },
      { path: '/leaderboards/umpires', element: withSuspense(<TopUmpiresPage />) },
      { path: '/records', element: withSuspense(<RecordsPage />) },

      // Public match discovery
      { path: '/matches', element: withSuspense(<MatchesPage />) },

      // Public team ecosystem
      { path: '/teams', element: withSuspense(<TeamsPage />) },
      { path: '/teams/compare', element: withSuspense(<TeamComparePage />) },
      { path: '/teams/:teamId', element: withSuspense(<TeamProfilePage />) },

      // Public match summary/scorecard
      { path: '/matches/:matchId/summary', element: withSuspense(<MatchSummaryPage />) },
      { path: '/matches/:matchId/feedback', element: <RequireAuth>{withSuspense(<MatchFeedbackPage />)}</RequireAuth> },

      // Real match scoring
      // U5.1 — match creation is now super_admin-only (Ground Owners create
      // through /ground-owner instead); was RequireAuth-only, which let an
      // approved umpire reach a form the backend now 403s.
      { path: '/matches/new', element: <RequireStaffRole allow={['super_admin']}><RequireMfaVerified>{withSuspense(<MatchSetupPage />)}</RequireMfaVerified></RequireStaffRole> },
      { path: '/matches/:matchId/setup', element: <RequireAuth>{withSuspense(<MatchRosterPage />)}</RequireAuth> },
      { path: '/matches/:matchId/score', element: <RequireAuth>{withSuspense(<RealScorerPage />)}</RequireAuth> },

      // Canteen — customer ordering is ground/canteen-scoped (see
      // CUSTOMER_CANTEEN_MIGRATION_INSPECTION.md); the old bare /canteen/menu
      // and /canteen/order-status routes depended on a platform-wide "find
      // the canteen" resolution that breaks once more than one canteen
      // exists. /canteen and /canteen/staff are untouched — staff routing
      // via CanteenEntryRedirect is a separate, unaffected concern.
      { path: '/canteen', element: <RequireAuth><CanteenEntryRedirect /></RequireAuth> },
      { path: '/grounds/:publicGroundId/canteen/:publicCanteenId/menu', element: <RequireAuth>{withSuspense(<CanteenMenuPage />)}</RequireAuth> },
      { path: '/grounds/:publicGroundId/canteen/:publicCanteenId/order-status', element: <RequireAuth>{withSuspense(<CanteenOrderStatusPage />)}</RequireAuth> },
      { path: '/canteen/staff', element: <RequireAuth>{withSuspense(<CanteenStaffDashboardPage />)}</RequireAuth> },

      // Ground booking
      { path: '/bookings', element: <RequireAuth>{withSuspense(<MyBookingsPage />)}</RequireAuth> },
      { path: '/bookings/staff', element: <RequireAuth>{withSuspense(<StaffBookingPage />)}</RequireAuth> },

      // Team booking and match proposals (Phase E)
      { path: '/team-booking/create', element: <RequireAuth>{withSuspense(<CreateTeamBookingPage />)}</RequireAuth> },
      { path: '/team-bookings', element: <RequireAuth>{withSuspense(<MyTeamBookingsPage />)}</RequireAuth> },
      { path: '/match-proposals', element: withSuspense(<MatchProposalsDiscoveryPage />) },
      { path: '/match-proposals/:publicProposalId', element: withSuspense(<MatchProposalDetailPage />) },
      { path: '/match-proposal/create', element: <RequireAuth>{withSuspense(<CreateMatchProposalPage />)}</RequireAuth> },

      // Tournament management (public reads, no auth wall)
      { path: '/tournaments', element: withSuspense(<TournamentsPage />) },
      { path: '/tournaments/new', element: <RequireAuth>{withSuspense(<CreateTournamentPage />)}</RequireAuth> },
      { path: '/tournaments/:publicTournamentId', element: withSuspense(<TournamentPage />) },

      // Catch-all — anything unmatched (typo, stale bookmark, dead link).
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export default function AppRoutes() {
  return <RouterProvider router={router} />
}
