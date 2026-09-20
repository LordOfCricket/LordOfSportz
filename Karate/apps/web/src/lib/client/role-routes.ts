import type { UserRole } from "@karate/types";

/** Pure mapping, safe to import from client components, server components, and Edge middleware alike. */
export function roleDashboardPath(role: UserRole): string {
  return `/dashboard/${role.toLowerCase()}`;
}

const DASHBOARD_ROLE_SEGMENTS: Record<string, UserRole> = {
  player: "PLAYER",
  coach: "COACH",
  academy: "ACADEMY",
  scorer: "SCORER",
};

/** Given a pathname like /dashboard/coach/students, returns the role that section requires, if any. */
export function roleRequiredForPath(pathname: string): UserRole | null {
  const match = /^\/dashboard\/([^/]+)/.exec(pathname);
  const segment = match?.[1];
  if (!segment) return null;
  return DASHBOARD_ROLE_SEGMENTS[segment] ?? null;
}
