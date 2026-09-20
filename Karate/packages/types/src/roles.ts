/**
 * The four fixed application roles. Never add SPECTATOR, ADMIN, REFEREE,
 * JUDGE, or KANSA here — those are competition functions, not login roles.
 * See OfficialFunction in ./officials.ts.
 */
export const USER_ROLES = ["PLAYER", "COACH", "ACADEMY", "SCORER"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}
