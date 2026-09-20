import type { UserRole } from "@karate/types";

export interface NavItem {
  label: string;
  href: string;
}

/**
 * Nav is role-aware but the visual system stays one design language across
 * all four roles (section 26 of the product spec) — only the item set
 * changes, not the shell, typography, or component library.
 */
export const ROLE_NAVIGATION: Record<UserRole, NavItem[]> = {
  PLAYER: [
    { label: "Overview", href: "/dashboard/player" },
    { label: "My Academy", href: "/dashboard/player/academy" },
    { label: "Tournaments", href: "/dashboard/player/tournaments" },
    { label: "Results", href: "/dashboard/player/results" },
    { label: "Belt & Certificates", href: "/dashboard/player/belt" },
    { label: "Stats & Ranking", href: "/dashboard/player/stats" },
    { label: "Notifications", href: "/dashboard/player/notifications" },
  ],
  COACH: [
    { label: "Overview", href: "/dashboard/coach" },
    { label: "My Students", href: "/dashboard/coach/students" },
    { label: "Academies", href: "/dashboard/coach/academies" },
    { label: "Tournaments", href: "/dashboard/coach/tournaments" },
    { label: "Results", href: "/dashboard/coach/results" },
    { label: "Notifications", href: "/dashboard/coach/notifications" },
  ],
  ACADEMY: [
    { label: "Overview", href: "/dashboard/academy" },
    { label: "Players", href: "/dashboard/academy/players" },
    { label: "Coaches", href: "/dashboard/academy/coaches" },
    { label: "Memberships", href: "/dashboard/academy/memberships" },
    { label: "Tournaments", href: "/dashboard/academy/tournaments" },
    { label: "Stats", href: "/dashboard/academy/stats" },
    { label: "Notifications", href: "/dashboard/academy/notifications" },
  ],
  SCORER: [
    { label: "Overview", href: "/dashboard/scorer" },
    { label: "My Assignments", href: "/dashboard/scorer/assignments" },
    { label: "Live Scoring", href: "/dashboard/scorer/live" },
    { label: "History", href: "/dashboard/scorer/history" },
    { label: "Notifications", href: "/dashboard/scorer/notifications" },
  ],
};

export const ROLE_LABELS: Record<UserRole, string> = {
  PLAYER: "Player",
  COACH: "Coach",
  ACADEMY: "Academy",
  SCORER: "Scorer",
};
