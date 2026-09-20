/**
 * Competition official functions. These are per-tournament/per-tatami
 * assignments held by a user with the SCORER role — never a login role
 * themselves. See docs/architecture/role-permission-model.md.
 */
export const OFFICIAL_FUNCTIONS = [
  "REFEREE",
  "JUDGE",
  "KANSA",
  "SCORE_SUPERVISOR",
  "TIMEKEEPER",
  "VIDEO_REVIEW_JUDGE",
  "TATAMI_MANAGER",
] as const;
export type OfficialFunction = (typeof OFFICIAL_FUNCTIONS)[number];

export const OFFICIAL_ASSIGNMENT_STATUSES = [
  "ASSIGNED",
  "CONFIRMED",
  "DECLINED",
  "COMPLETED",
  "REVOKED",
] as const;
export type OfficialAssignmentStatus = (typeof OFFICIAL_ASSIGNMENT_STATUSES)[number];

/** Enforced by apps/api/src/domain/officialAssignmentLifecycle.ts — never a client-set value. */
export const OFFICIAL_ASSIGNMENT_STATUS_TRANSITIONS: Record<
  OfficialAssignmentStatus,
  OfficialAssignmentStatus[]
> = {
  ASSIGNED: ["CONFIRMED", "DECLINED", "REVOKED"],
  CONFIRMED: ["COMPLETED", "REVOKED"],
  DECLINED: [],
  COMPLETED: [],
  REVOKED: [],
};

export const TATAMI_STATUSES = ["INACTIVE", "ACTIVE", "PAUSED", "MAINTENANCE", "CLOSED"] as const;
export type TatamiStatusValue = (typeof TATAMI_STATUSES)[number];

/** Enforced by apps/api/src/domain/tatamiLifecycle.ts — never a client-set value. */
export const TATAMI_STATUS_TRANSITIONS: Record<TatamiStatusValue, TatamiStatusValue[]> = {
  INACTIVE: ["ACTIVE", "CLOSED"],
  ACTIVE: ["PAUSED", "MAINTENANCE", "CLOSED"],
  PAUSED: ["ACTIVE", "MAINTENANCE", "CLOSED"],
  MAINTENANCE: ["ACTIVE", "CLOSED"],
  CLOSED: [],
};
